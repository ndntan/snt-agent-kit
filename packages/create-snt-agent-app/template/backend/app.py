import os
import sys
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify, send_from_directory, session
from flask_apscheduler import APScheduler
from flask_socketio import SocketIO
from flask_migrate import Migrate
import requests
import yaml
from dotenv import load_dotenv

from db_config import get_database_uri
from extensions import db
from sensolus_client_api import (
    SENSOLUS_BASE_URL,
    SENSOLUS_COOKIE_NAME,
    make_sensolus_request,
)

# Get the project root (parent of backend folder)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load .env from project root (env vars take precedence over .env file)
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    force=True,
)
logger = logging.getLogger("{{APP_NAME}}")
logger.setLevel(logging.INFO)

# Serve from 'frontend/dist' in production (Vite build output)
static_folder = os.path.join(PROJECT_ROOT, 'frontend', 'dist')
app = Flask(__name__, static_folder=static_folder)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = get_database_uri()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Initialize Flask-Migrate
import models  # noqa: F401
migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
Migrate(app, db, directory=migrations_dir)

MANAGER_AUTH_KEY = os.environ.get("MANAGER_AUTH_KEY")

# Manager-provided headers — typos in string literals silently 401, so route everything through these.
HEADER_MANAGER_AUTH = "X-Sensolus-Manager-Auth"
HEADER_SENSOLUS_AUTH = "X-Sensolus-Auth"

def _load_app_descriptor():
    """Load the single-source descriptor from the repo-root sensolus-app file.

    The same file is read by the manager from the git repo at registration time
    (its `build:` block drives the Jenkins pipeline) and baked into the image so
    this runtime endpoint serves identical content — no drift. The `build:`
    block is registration-only, so it's stripped from the runtime descriptor.
    """
    for name in ("sensolus-app.yaml", "sensolus-app.yml", "sensolus-app.json"):
        path = os.path.join(PROJECT_ROOT, name)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                descriptor = yaml.safe_load(f)  # safe_load also parses JSON
            descriptor.pop("build", None)
            logger.info("Loaded app descriptor from %s", name)
            return descriptor
    raise RuntimeError(
        f"No sensolus-app.(yaml|yml|json) found at {PROJECT_ROOT}"
    )


APP_DESCRIPTOR = _load_app_descriptor()


def _mask(value):
    """Mask a secret for logging — show length and first/last 2 chars only."""
    if not value:
        return "<empty>"
    if len(value) <= 4:
        return f"<len={len(value)} value=***>"
    return f"<len={len(value)} {value[:2]}...{value[-2:]}>"


def _deny(reason, **fields):
    """Log a manager-auth denial and also print to stderr so it cannot be
    silently swallowed by a misconfigured logging chain."""
    parts = " ".join(f"{k}={v}" for k, v in fields.items())
    msg = f"Manager auth denied: {reason} {parts}".strip()
    logger.warning(msg)
    print(f"[manager-auth] {msg}", file=sys.stderr, flush=True)


def require_manager_auth():
    """Return a 401 response if the request lacks a valid manager auth key."""
    presented = request.headers.get(HEADER_MANAGER_AUTH)
    common = dict(
        method=request.method,
        path=request.path,
        remote=request.remote_addr,
        presented=_mask(presented),
    )
    if not MANAGER_AUTH_KEY:
        _deny("MANAGER_AUTH_KEY env var is not set", **common)
        return jsonify({"error": "Manager auth not configured"}), 401
    if presented is None:
        _deny(
            f"{HEADER_MANAGER_AUTH} header missing",
            expected=_mask(MANAGER_AUTH_KEY),
            headers=",".join(request.headers.keys()),
            **common,
        )
        return jsonify({"error": "Unauthorized"}), 401
    if presented != MANAGER_AUTH_KEY:
        _deny(
            f"{HEADER_MANAGER_AUTH} value mismatch",
            expected=_mask(MANAGER_AUTH_KEY),
            **common,
        )
        return jsonify({"error": "Unauthorized"}), 401
    return None


@app.route('/.well-known/sensolus-app')
def app_descriptor():
    unauthorized = require_manager_auth()
    if unauthorized:
        return unauthorized
    return jsonify(APP_DESCRIPTOR)

# --- Background scheduler ---
scheduler = APScheduler()
scheduler.init_app(app)


@scheduler.task('interval', id='heartbeat', minutes=10)
def heartbeat():
    logger.info("Scheduled heartbeat: the background scheduler is alive and well.")


@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Serve Vite build assets."""
    return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)


@app.route('/api/auth/check')
def check_auth():
    """Check if the user has a valid session cookie or stored API key."""
    token = request.cookies.get(SENSOLUS_COOKIE_NAME)
    stored_api_key = session.get('api_key')
    logger.info(f"Auth check: hasSessionToken={token is not None}, hasStoredApiKey={stored_api_key is not None}")
    return jsonify({
        "hasSessionToken": token is not None,
        "hasStoredApiKey": stored_api_key is not None
    })


@app.route('/api/auth/api-key', methods=['POST'])
def set_api_key():
    """Validate and save an API key in the session.

    Validates against /loginInfo so an invalid key is rejected before it gets stored.
    """
    body = request.get_json(silent=True) or {}
    api_key = (body.get('apiKey') or '').strip()
    if not api_key:
        return jsonify({"error": "API key is required"}), 400

    try:
        response = requests.get(
            f"{SENSOLUS_BASE_URL}/loginInfo",
            params={'apiKey': api_key},
            timeout=10,
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"API key validation request failed: {e}")
        return jsonify({"error": f"Validation failed: {e}"}), 502

    if response.status_code in (401, 403):
        return jsonify({"error": "Invalid API key"}), 401
    if response.status_code >= 400:
        return jsonify({"error": f"Validation failed: HTTP {response.status_code}"}), 502

    session['api_key'] = api_key
    # Invalidate cached user identity — it'll be re-resolved on next favourites call
    session.pop('user_key', None)
    logger.info("API key validated and stored in session")
    return jsonify({"ok": True})


@app.route('/api/auth/api-key', methods=['DELETE'])
def clear_api_key():
    """Remove the stored API key from the session."""
    session.pop('api_key', None)
    session.pop('user_key', None)
    return jsonify({"ok": True})


@app.route('/api/loginInfo')
def get_login_info():
    """Get user login info and preferences (language, timezone, units)."""
    logger.info("=== GET /api/loginInfo ===")
    data, status_code = make_sensolus_request('/loginInfo')
    return jsonify(data), status_code


@app.route('/api/organisations')
def get_organisations():
    """Get list of organisations."""
    logger.info("=== GET /api/organisations ===")

    extra_params = {}
    name_filter = request.args.get('nameFilter', '')
    if name_filter:
        extra_params['nameFilter'] = name_filter

    data, status_code = make_sensolus_request('/organisations', extra_params)
    return jsonify(data), status_code


@app.route('/api/geozones')
def get_geozones():
    """Get all geozones for an organisation."""
    logger.info("=== GET /api/geozones ===")

    extra_params = {}
    org_id = request.args.get('orgId')
    if org_id:
        extra_params['orgId'] = org_id

    data, status_code = make_sensolus_request('/geozones', extra_params)
    return jsonify(data), status_code


@app.route('/api/devices/byFilter', methods=['POST'])
def get_devices_by_filter():
    """Get devices by filter (e.g. organisation filter)."""
    logger.info("=== POST /api/devices/byFilter ===")

    extra_params = {}
    for param in ['fields']:
        val = request.args.get(param)
        if val is not None:
            extra_params[param] = val

    body = request.get_json()
    data, status_code = make_sensolus_request('/devices/byFilter', extra_params, method='POST', json_body=body)
    return jsonify(data), status_code


LOCATIONIQ_KEY = os.environ.get('LOCATIONIQ_KEY', '')
MAPBOX_KEY = os.environ.get('MAPBOX_KEY', '')


@app.route('/api/config')
def app_config():
    """Runtime config served to the frontend. Lets one Docker image deploy
    across dev/demo/prod by reading keys from the container's env at request
    time instead of baking them into the bundle at build time."""
    return jsonify({
        'mapboxKey': MAPBOX_KEY,
        'locationiqKey': LOCATIONIQ_KEY,
    }), 200


@app.route('/api/geocode')
def geocode():
    """Proxy LocationIQ autocomplete to avoid CORS/domain restrictions."""
    q = request.args.get('q', '')
    if not q:
        return jsonify([]), 200

    try:
        response = requests.get(
            'https://eu1.locationiq.com/v1/autocomplete.php',
            params={'key': LOCATIONIQ_KEY, 'q': q},
            timeout=10
        )
        response.raise_for_status()
        return jsonify(response.json()), 200
    except requests.exceptions.RequestException as e:
        logger.error(f"Geocode error: {e}")
        return jsonify([]), 200


@app.route('/api/reverse-geocode')
def reverse_geocode():
    """Proxy LocationIQ reverse geocoding to avoid CORS/domain restrictions."""
    lat = request.args.get('lat', '')
    lng = request.args.get('lng', '')
    if not lat or not lng:
        return jsonify({'error': 'lat and lng are required'}), 400

    try:
        response = requests.get(
            'https://eu1.locationiq.com/v1/reverse',
            params={'key': LOCATIONIQ_KEY, 'lat': lat, 'lon': lng, 'format': 'json'},
            timeout=10
        )
        response.raise_for_status()
        return jsonify(response.json()), 200
    except requests.exceptions.RequestException as e:
        logger.error(f"Reverse geocode error: {e}")
        return jsonify({'error': 'Reverse geocode failed'}), 502


def _get_user_key():
    """
    Resolve a stable user key for favourites.
    Uses cached loginInfo from session. If not cached yet, fetches it.
    Priority: email > apiKeyName > hashed API key.
    """
    # Check if we already resolved and cached it
    cached = session.get('user_key')
    if cached:
        logger.debug(f"User key from cache: {cached}")
        return cached

    # Fetch loginInfo from Sensolus API
    logger.info("Resolving user key from loginInfo...")
    data, status = make_sensolus_request('/loginInfo')
    if status == 200:
        user_key = data.get('email') or data.get('username')
        if not user_key:
            # API key auth — use the key name if available
            user_key = data.get('apiKeyName')
        if user_key:
            logger.info(f"Resolved user key: {user_key}")
            session['user_key'] = user_key
            return user_key
        logger.warning(f"loginInfo returned 200 but no user identifier found: {list(data.keys())}")
    else:
        logger.warning(f"loginInfo returned status {status}: {data}")

    # Last resort: use the stored API key itself (hashed)
    import hashlib
    api_key = session.get('api_key', '')
    if api_key:
        user_key = f"apikey:{hashlib.sha256(api_key.encode()).hexdigest()[:16]}"
        logger.info(f"Falling back to hashed API key: {user_key}")
        session['user_key'] = user_key
        return user_key

    logger.warning("Could not resolve user key — no auth available")
    return None


@app.route('/api/favourites')
def get_favourites():
    """Get all favourite organisation IDs for the current user."""
    logger.info("=== GET /api/favourites ===")
    try:
        from models import FavouriteOrganisation
        user_key = _get_user_key()
        if not user_key:
            logger.info("No user key — returning empty favourites")
            return jsonify([])
        favs = FavouriteOrganisation.query.filter_by(user_key=user_key).all()
        logger.info(f"Returning {len(favs)} favourites for {user_key}")
        return jsonify([f.org_id for f in favs])
    except Exception as e:
        logger.exception(f"Error in get_favourites: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/favourites/<int:org_id>', methods=['PUT'])
def add_favourite(org_id):
    """Add an organisation to favourites for the current user."""
    logger.info(f"=== PUT /api/favourites/{org_id} ===")
    try:
        from models import FavouriteOrganisation
        user_key = _get_user_key()
        if not user_key:
            logger.warning("Cannot add favourite — no user key")
            return jsonify({'error': 'Not authenticated'}), 401
        existing = FavouriteOrganisation.query.filter_by(user_key=user_key, org_id=org_id).first()
        if not existing:
            fav = FavouriteOrganisation(user_key=user_key, org_id=org_id)
            db.session.add(fav)
            db.session.commit()
            logger.info(f"Added favourite org {org_id} for {user_key}")
        else:
            logger.info(f"Favourite org {org_id} already exists for {user_key}")
        return jsonify({'orgId': org_id, 'favourite': True})
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error in add_favourite: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/favourites/<int:org_id>', methods=['DELETE'])
def remove_favourite(org_id):
    """Remove an organisation from favourites for the current user."""
    logger.info(f"=== DELETE /api/favourites/{org_id} ===")
    try:
        from models import FavouriteOrganisation
        user_key = _get_user_key()
        if not user_key:
            logger.warning("Cannot remove favourite — no user key")
            return jsonify({'error': 'Not authenticated'}), 401
        fav = FavouriteOrganisation.query.filter_by(user_key=user_key, org_id=org_id).first()
        if fav:
            db.session.delete(fav)
            db.session.commit()
            logger.info(f"Removed favourite org {org_id} for {user_key}")
        else:
            logger.info(f"Favourite org {org_id} not found for {user_key}")
        return jsonify({'orgId': org_id, 'favourite': False})
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error in remove_favourite: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/cron/collect-org-stats', methods=['POST'])
def collect_org_stats():
    """Snapshot tracker and user counts for every org reachable via the manager-provided API key.

    Idempotent within a day: re-running overwrites the same (org_id, snapshot_date) row.
    """
    unauthorized = require_manager_auth()
    if unauthorized:
        return unauthorized

    api_key = request.headers.get(HEADER_SENSOLUS_AUTH)
    if not api_key:
        return jsonify({"error": f"Missing {HEADER_SENSOLUS_AUTH} header"}), 400

    from datetime import date
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from models import OrgDailyStat

    logger.info("=== POST /cron/collect-org-stats ===")
    try:
        response = requests.get(
            f"{SENSOLUS_BASE_URL}/organisations",
            params={'apiKey': api_key},
            timeout=60,
        )
        response.raise_for_status()
        orgs = response.json()
    except requests.exceptions.RequestException as e:
        logger.exception(f"Failed to fetch organisations: {e}")
        return jsonify({"error": f"Failed to fetch organisations: {e}"}), 502

    today = date.today()
    count = 0
    for org in orgs:
        metrics = (org.get('statistics') or {}).get('metrics') or {}
        stmt = pg_insert(OrgDailyStat.__table__).values(
            org_id=org['id'],
            org_name=org.get('name'),
            snapshot_date=today,
            tracker_count=int(metrics.get('NUMBER_OF_TRACKERS') or 0),
            user_count=int(metrics.get('NUMBER_OF_USERS') or 0),
        ).on_conflict_do_update(
            constraint='uq_org_day',
            set_={
                'org_name': org.get('name'),
                'tracker_count': int(metrics.get('NUMBER_OF_TRACKERS') or 0),
                'user_count': int(metrics.get('NUMBER_OF_USERS') or 0),
                'captured_at': datetime.now(timezone.utc),
            },
        )
        db.session.execute(stmt)
        count += 1
    db.session.commit()
    logger.info(f"Snapshotted {count} orgs for {today.isoformat()}")
    return jsonify({"snapshotDate": today.isoformat(), "orgsSnapshotted": count})


@app.route('/api/org-stats/totals')
def get_org_stats_totals():
    """Daily totals across all orgs: org count, total trackers, total users."""
    logger.info("=== GET /api/org-stats/totals ===")
    from models import OrgDailyStat
    rows = (
        db.session.query(
            OrgDailyStat.snapshot_date,
            db.func.count(OrgDailyStat.id),
            db.func.sum(OrgDailyStat.tracker_count),
            db.func.sum(OrgDailyStat.user_count),
        )
        .group_by(OrgDailyStat.snapshot_date)
        .order_by(OrgDailyStat.snapshot_date)
        .all()
    )
    return jsonify([
        {
            'date': d.isoformat(),
            'orgCount': int(orgs or 0),
            'trackerTotal': int(trackers or 0),
            'userTotal': int(users or 0),
        }
        for d, orgs, trackers, users in rows
    ])


def bootstrap():
    """Create the database, apply migrations and start the scheduler — once
    per process.

    This runs at import, not under `if __name__ == '__main__'`: in the
    container gunicorn imports `app:app` (see the Dockerfile CMD), so a
    __main__-only bootstrap would never fire and the app would serve against a
    database with no tables and no scheduler.
    """
    from init_db import ensure_database, run_migrations
    try:
        ensure_database()
        # Pass the app: letting init_db re-import this module would run every
        # module-level statement a second time.
        run_migrations(app)
    except Exception as e:
        logger.warning(f"DB init skipped: {e}")
    scheduler.start()


# `flask db migrate` builds the app to read its models — bootstrapping there
# would run the very migrations the command is about to write. The marker
# lives on `extensions`, not a module global: under `python app.py` this
# module is imported twice under two names (__main__ and app), which have
# separate globals and would each think they were first.
_UNDER_FLASK_CLI = os.path.basename(sys.argv[0]).startswith('flask')
import extensions  # noqa: E402

if not _UNDER_FLASK_CLI and not getattr(extensions, 'bootstrapped', False):
    extensions.bootstrapped = True
    bootstrap()


if __name__ == '__main__':
    # LOCAL DEVELOPMENT ONLY. In the container gunicorn serves the app — see
    # the Dockerfile CMD. Werkzeug is acceptable here and nowhere else, which
    # is why allow_unsafe_werkzeug is set unconditionally on this path rather
    # than tied to FLASK_DEBUG: Flask-SocketIO refuses to start Werkzeug when
    # stdin is not a terminal unless it is set, and a container has no
    # terminal — tying the two together is what made the shipped image
    # unbootable (STIC-16081).
    debug_mode = os.getenv('FLASK_DEBUG', '0').lower() in ('1', 'true', 'yes')
    logger.info(f"Starting dev server on port 5000 (scheduler active, debug={debug_mode})")
    socketio.run(app, debug=debug_mode, port=5000, host='0.0.0.0',
                 allow_unsafe_werkzeug=True, use_reloader=False)
