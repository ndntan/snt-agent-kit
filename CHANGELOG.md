# Changelog

## 0.9.3

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity). First release published by the **Publish to npm** GitHub Actions workflow with npm trusted publishing instead of a Jenkins npm token; the npm page shows its provenance (the commit and workflow run that built it).

### `@sensolus/create-snt-agent-app` 0.6.3

- Version bump only (publish parity). Published the same way.

## 0.9.2

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app` 0.6.2

- **Docs: declaring a scheduled action does not schedule it.** The README, the template's `CLAUDE.md` and the comment above `scheduledActions:` in `sensolus-app.yaml` now say this outright:
  - The platform creates the schedule when an organisation adds the app, one per organisation. Until an organisation adds it, the action never runs.
  - The organisation changes the time in the platform (Admin → Active agents → the app → Scheduled actions). The Agent Manager only lists the declared actions and can run one by hand.
  - A job that covers several organisations at once goes to the one organisation whose key sees them all, with `app.orgType` and `role` to match.

## 0.9.1

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app` 0.6.1

- **New `.dockerignore` in scaffolded apps.** Without one, `docker build` sent everything on the developer's machine into the build:
  - The builder stage runs `npm ci` and then `COPY frontend/ ./`, so a local `frontend/node_modules` overwrote the clean install with whatever that machine had. The image now gets exactly what `package-lock.json` specifies.
  - `backend/.venv` and `__pycache__` folders landed in `/app/backend`. They added dead weight and host-built binaries, since the image installs its own packages from `requirements.txt`.
  - A local `.env` (API key, map keys) was part of the build context. The container gets these as environment variables instead.

## 0.9.0

### `@sensolus/snt-agent-kit`

- **New `SntSiteMapLayer`** — renders the organisation's site maps (floor plans, yard layouts) from the new `GET /api/v2/site-maps` endpoint inside `SntMap`, toggled together by a **Site maps** chip in the Layers control, like the platform's asset map. Each image is pinned onto its four `corners` with a CSS `matrix3d` homography, so rotated *and* skewed plans render where they were placed (the platform's 3-corner affine overlay can't express the 4th corner). Honours each site map's `opacity`; optional `floor` filter (floor-less plans show on every floor). Drawn in its own pane above the basemap and below geozones/markers.
- **New `api.fetchSiteMaps(orgId?)` adapter** on `SntUiProvider`, defaulting to `GET /api/site-maps[?orgId=…]`.
- New exports `SntSiteMapLayer` and `siteMapImageUrl(image)`.

### `@sensolus/create-snt-agent-app` 0.6.0

- **New `/api/site-maps` backend route** proxying `GET /site-maps` (optional `orgId`). It rewrites each image's relative `downloadUrl` to an absolute platform URL so the browser loads the plan straight from Sensolus — the `imageToken` authorises the download, no API key involved.
- Template kit pin bumped 0.8.2 → 0.8.3, the last published release (pin and lock trail by one release, see 0.8.3). Scaffolded apps get `SntSiteMapLayer` once the pin moves to 0.9.0 in the next release; until then the route is there and the layer can be adopted by bumping the app's kit dependency.

## 0.8.3

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app` 0.5.1

- **Fixed: a hard refresh on any route but `/` returned 404 in the container.** `/devices`, `/widgets` and every other React Router path 404'd on direct load, so a bookmark, a shared link or F5 broke the app. Development never showed it — Vite serves its own fallback on `:3000`, so the gap only existed where the Flask layer serves the built frontend. A catch-all route now returns the SPA shell, and a real file in `frontend/dist` (favicon, robots.txt) is still served as itself. Paths under `api/`, `actions/` and `.well-known/` keep returning a JSON 404 rather than the shell, so a mistyped API call still looks like a mistake instead of a page of HTML. Path traversal was checked: `send_from_directory` rejects it and the request falls through to the shell.
- **Fixed: every scaffolded app was titled "Sensolus Organisations Dashboard"** in the browser tab — left over from before the 0.5.0 rewrite to a one-customer-organisation sample. `frontend/index.html` now uses `{{APP_NAME}}`, which the scaffolder substitutes.
- **Every dependency is pinned, transitive ones included.** `requirements.txt` pinned its 11 direct packages but 26 more floated underneath — among them Werkzeug, `alembic` (which applies the migrations) and `APScheduler` (whose 4.x is a breaking rewrite). That is the same shape as the SQLAlchemy 2.1 break in 0.5.0, waiting to happen again.
  - New `backend/requirements.in` holds the direct dependencies and is the only file edited by hand. `backend/requirements.txt` is generated from it and pins all 37 packages: `uv pip compile requirements.in --python-version 3.10 -o requirements.txt`.
  - **Python 3.10 is now stated as the floor.** Nothing in the repo declared a supported version before — `FROM python:3.12-slim` in the Dockerfile was the only mention of one anywhere. The lock is resolved for 3.10 so a developer on an older interpreter than the image is not locked out, and the resulting pins were checked to install on 3.10, 3.12 and 3.13.
  - The frontend was worse: every version was a caret range and no lock shipped, so each scaffolded app got whatever was current that day (a fresh install resolved `react` 19.3.0 against `^19.2.3`, `vite` 7.3.6 against `^7.3.1`). `frontend/package.json` now pins exact versions and ships a `package-lock.json`, so the Dockerfile's `npm ci` is reproducible.
  - `@sensolus/snt-agent-kit` is pinned to the last **published** release (0.8.2), not the one this commit publishes — a lock cannot reference a version that is not on the registry yet. The template's kit pin and its lock therefore trail by one release and want bumping as part of the next one.
  - Both locks were generated from an app scaffolded and booted end to end, not resolved in the abstract: `npm ci`, `npm run build` and gunicorn all verified against them.
- **The API key is now required: a scaffolded app always has its `openapi.json`.** The scaffolder asked for a key but took Enter for an answer, warned-and-continued when the download failed, and skipped silently with no TTY. All three produced an app with no spec, and a coding agent working in it then invented endpoints the app's key may not call. The spec is no longer optional by accident:
  - No key at the prompt → it asks again, up to three times, instead of offering `(Enter to skip)`.
  - A refused key or an unreachable domain → it says why and asks again, up to three times. Usually a typo, so it is worth re-asking rather than failing on the first keystroke.
  - No TTY and no `--api-key` → it stops **before copying anything**, naming both `--api-key` and `--skip-openapi`.
  - When it does give up, the half-made app is removed and the exit status is non-zero. Previously it exited 0 with an app that could not be worked on.
  - `--skip-openapi` is unchanged and remains the one deliberate way to decline the spec; the closing summary now says `SKIPPED` and what that costs, rather than `not downloaded yet`.
  - This reverses two behaviours that earlier tests asserted on purpose (*"a new app has no openapi.json until it asks for one"*, *"a download that fails still leaves a working app"*). Both are rewritten, and a test covers the no-TTY guard.
  - Note: `openapi.json` documents what a key may do, it does not enforce it — the key the app runs with in production is injected at deploy time and may have another role. This raises the floor for development; it is not a runtime permission check.
  - The quick-start no longer says `cp .env.example .env`: a successful run always writes `.env` with the domain and key, and copying over it threw them away.
- **Local development and the image now run the same server.** 0.8.1 put gunicorn in the container but left `python backend/app.py` (Flask's development server, Werkzeug) as the local entry point, so the two could drift apart again — exactly the gap that made STIC-16081 reach production. There is now one way to run the app:
  - New **`backend/gunicorn.conf.py`** holds every setting (`chdir`, `workers = 1`, `threads = 8`, `timeout = 600`, `bind`, access log to stdout) with the reasoning for each. `chdir` is derived from the file's own location, so gunicorn can be launched from the repo root or from `/app`.
  - `start-backend.sh`, the VS Code **Start Backend** task and the Dockerfile `CMD` all run `gunicorn -c gunicorn.conf.py app:app` against that one file. Changing a setting changes both environments.
  - **The `if __name__ == '__main__'` block is gone from `app.py`**, and with it `socketio.run(...)`, `allow_unsafe_werkzeug=True` and `FLASK_DEBUG`. `app.py` is only ever imported as `app:app`; `python app.py` now does nothing. The import-time `bootstrap()` and the `flask db …` guard are unchanged.
  - No auto-reload, matching production — restart the backend after a backend change. (Frontend HMR through Vite is unaffected.)
  - gunicorn needs `fcntl`, so the backend runs on Linux, macOS or WSL, not native Windows. `start-backend.sh` was already bash-only.
  - An app made from an earlier template can take the same change: add `backend/gunicorn.conf.py`, point `start-backend.sh`, `.vscode/tasks.json` and the Dockerfile `CMD` at it, and delete the `__main__` block.
- Template README and CLAUDE.md, this package's README and the scaffolder's closing hints describe the single entry point. Fixed a stale line in this package's README that still described the image as launching `python backend/app.py`.

## 0.8.2

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app` 0.5.0

- **The template is now a sample for one customer organisation.** It replaces the organisation list, which only made sense with a Sensolus or partner key. Three tabs:
  - **Hello world**: who is signed in, with which credential, and for which organisation (its type, partner, language and timezone), from `/api/loginInfo`. It warns when the organisation is not a normal one.
  - **Widgets**: the widget showcase, unchanged.
  - **Device browser**: searches the organisation's devices by serial or name (`POST /api/devices/byFilter` with an `IDENTIFIER` filter), stars favourites, and shows the picked device's details and last position on the map.
- **Favourites are devices**, per user, by serial: `GET /api/favourites`, `PUT` / `DELETE /api/favourites/<serial>`, table `favourite_devices`. The migration chain starts over at `001_add_favourite_devices`. The organisation favourites, the daily organisation stats with their cron job, and `/api/organisations` are gone.
- **`sensolus-app.yaml` is `schemaVersion: 2`**: `app.orgType: normal`, a `features` block (`database`, `maps`, `reverseGeocoding`, `autoDeploy`), an empty `environment`, and one scheduled action, `POST /actions/daily-summary` (`cadence: daily`, `role: read`), which counts the organisation's devices and how many reported in the last 24 hours. **It needs an Agent Manager that reads schemaVersion 2**; an older one refuses the file with "schemaVersion must be 1".
- `init_db.py` drops `repair_dirty_state()`, a one-time repair for the old organisation-favourites table.
- **Fixed: a new app's image crashed at start with `No module named 'psycopg'`** once SQLAlchemy 2.1 was out. `flask-sqlalchemy` pulled SQLAlchemy unpinned, and from 2.1 a bare `postgresql://` URL means psycopg (v3), while the template installs psycopg2. `db_config.py` now names `postgresql+psycopg2://`, and `requirements.txt` pins `SQLAlchemy==2.0.54`. An app made from an earlier template needs the same two lines before its next build.
- **Fixed: a new app could start with an empty database** where the platform does not let apps connect to the `postgres` maintenance database. At start-up `ensure_database()` connected to `postgres` to look for the app's database, and the migrations ran in the same `try`. A refused connection therefore skipped them too, and the app started without its tables. `ensure_database()` now tries the app's own database first and goes through `postgres` only to create a missing one. The migrations run even when that check fails. `migrations/env.py` also keeps the app's existing loggers (`disable_existing_loggers=False`): the migrations run inside the app, and Alembic's default silenced the app's own logging from then on. An app made from an earlier template needs the same change in `init_db.py`, `app.py` and `migrations/env.py`.
- **`openapi.json` is downloaded for the app instead of shipped in the template.** The platform tailors the spec to the API key that asks for it (its role, its organisation's plan and type), so a copy baked into the template described nobody's key, and it never changed version.
  - The scaffolder asks for the platform domain and an API key of the organisation the app is for. It downloads `GET https://<domain>/rest/api/v2/openapi.json` (key sent as a Bearer token, never in the URL) and saves the domain and key in the new app's `.env`.
  - Flags for non-interactive use: `--api-key <key>`, `--domain <domain>`, `--skip-openapi`. A failed download warns and still creates the app.
  - The domain may be typed as a host (`dev.sensolus.com`), with `https://` and a trailing slash, or as a link copied from the browser: only the host is used, and only the host goes into `.env`. A platform that cannot be reached says why (an unknown host, a refused connection, a certificate), and an unknown host asks whether the domain is right.
  - New `scripts/update-openapi.mjs` in the template refreshes the file later, from `SENSOLUS_DOMAIN` / `SENSOLUS_API_KEY` in `.env`. It refuses an HTML page (the platform answers unknown paths with 200 and its single-page app) and JSON that is not an OpenAPI document.
  - The spec lists only what the key's role may call, so a read-only key gives one without any write endpoint. The prompt, `.env.example`, this package's README and the template `CLAUDE.md` say to use a key with the role the app needs, and `CLAUDE.md` tells the coding agent to ask for one rather than conclude that the platform cannot do something.
  - `openapi.json` is gitignored. `.env.example` gains `SENSOLUS_DOMAIN` and `SENSOLUS_API_KEY`. The template `CLAUDE.md` tells the coding agent to refresh the spec before API work and after every platform release, to read `info.version`, and not to call endpoints the spec does not list.
- The template README and CLAUDE.md, this package's README and the scaffolder's closing hints describe the new sample.
- First tests for the scaffolder: `npm test` (node's built-in runner, `packages/create-snt-agent-app/test/`), including two end-to-end runs of the scaffolder.

## 0.8.1

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app`

- **Fixed: a scaffolded app failed to boot in the Agent Manager** with `RuntimeError: The Werkzeug web server is not designed to run in production` (STIC-16081). The template's Dockerfile ran `python backend/app.py`, i.e. Flask's development server, and `socketio.run()` passed `allow_unsafe_werkzeug=debug_mode` — Flask-SocketIO refuses to start Werkzeug when no terminal is attached unless that flag is set, and a container has neither a terminal nor `FLASK_DEBUG`. Two changes:
  - **The image now runs gunicorn** (`--workers 1 --threads 8 --timeout 600`, pinned `gunicorn==23.0.0` in `requirements.txt`). Socket.IO keeps working under it: the `threading` async mode serves WebSocket through `simple-websocket`, which supports gunicorn's threaded workers. Verified: a Socket.IO client connects over both polling and websocket.
  - **Database init and the scheduler now run at import** (`bootstrap()` in `app.py`, guarded so `flask db …` commands and the double import under `python app.py` do not run them twice; `init_db.run_migrations(app)` takes the app instead of re-importing `app.py`). Under gunicorn the `__main__` block never runs, so anything left there would silently not happen.
  - `python backend/app.py` stays the **local development** entry and now passes `allow_unsafe_werkzeug=True` unconditionally, so it also boots headless (VS Code task, `start-backend.sh`, a terminal without a TTY).
  - Template README and CLAUDE.md say which server runs where.

## 0.8.0

### `@sensolus/snt-agent-kit`

- **`SntMap` street basemap moved from LocationIQ raster tiles to the Mapbox GL vector basemap**, aligning agent apps with the Sensolus platform. New `src/widgets/map/vectorBasemap.js` is a port of the platform's `CommonMapReact/Layers/LayerVectorGL.ts` — Mapbox `light-v11` recolored at runtime with the Sensolus design tokens (`SntColors`), wrapped as a Leaflet layer by `mapbox-gl-leaflet` so all existing overlays (geozones, device markers, clusters, popups) keep working on top. Keep the two files in sync.
- **`mapboxKey` now drives the street basemap too** (it previously only enabled the satellite layer). No new prop and no config change: an app already passing `mapboxKey` gets the vector basemap. Note the platform splits this into two tokens (`mapbox.gl.access.token` / `mapbox.tiles.access.token`); agent apps use the single injected key for both.
- **New `streetStyle` prop** — `'default'` (Sensolus transport tints: motorways in brand yellow, the rest muted), `'colorful'`, `'light'`, `'dark'`. Changing the prop re-styles the live GL map instead of rebuilding the layer. New exports `SNT_STREET_STYLES`, `SNT_DEFAULT_STREET_STYLE`, `getSntStreetStyle`, `sntStreetStyleThumbnailUrl` and `isWebGlSupported` let apps build a style picker.
- **Raster fallback preserved.** Without `mapboxKey`, or in a browser with no WebGL2, `SntMap` builds the raster street layer as before (LocationIQ with `locationiqKey`, OpenStreetMap without). A WebGL context that fails at layer-add time (browsers cap live contexts) is caught and swapped for raster rather than escaping the effect into the app's error boundary — same guard as the platform's STIC-15891 fix.
- **Map zoom/bounds now match the GL camera:** `minZoom` is derived from the container height (below it, GL renders at a higher zoom than Leaflet and the basemap drifts from the overlays), `maxZoom` is pinned on the map (the GL layer's limits don't register, leaving `getMaxZoom()` at `Infinity` and NaN-crashing `project()`), and `maxBounds` clamps to the Mercator edge (±85.051129°) instead of ±90.
- Raster street and satellite tiles now request 512px `@2x` tiles on retina screens, matching the platform's raster layer.
- New dependencies: `mapbox-gl` ^3.26.0 and `mapbox-gl-leaflet` ^0.0.16. Both are externalized from the library build (like `leaflet`) and resolved by the consuming app's bundler.

### `@sensolus/create-snt-agent-app`

- **`MAPBOX_KEY` now also enables the vector street basemap** — no new env var, so existing deployments pick it up on the next image build. `_env.example` and both READMEs updated to describe what each key covers.
- Template frontend now requires `@sensolus/snt-agent-kit` ^0.8.0.

## 0.7.14

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app`

- **Terminology: "micro app" → "agent".** Template docs now say "Sample Agent" / "build agents" instead of "Sample Micro App" / "micro applications", and the descriptor consumer is named the **Agent Manager** (was "Micro App Manager") in `sensolus-app.yaml`, template `CLAUDE.md`, and the changelog. No code or descriptor-format changes.

## 0.7.13

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app`

- **Scaffolder uses the stdlib `venv` module instead of `virtualenv`.** `index.js` now runs `python3 -m venv .venv` (`python` on Windows) to create the backend environment, dropping the dependency on the third-party `virtualenv` command and the PATH probe that checked for it. A missing interpreter is surfaced via the spawn error, and the manual-recovery message matches. Aligns with the template README, which already documented `python -m venv`.
- **Scaffolder "Next steps" now covers the local database.** Removed the `MAPBOX_KEY` / `LOCATIONIQ_KEY` map-key guidance from the post-scaffold output; replaced it with instructions to bring up the local PostgreSQL/PostGIS via `docker compose -f infra/docker-compose.yml up -d`, plus a note to set `database: false` in `sensolus-app.yaml` when no database is needed.

## 0.7.12

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app`

- **Single-source app descriptor via `sensolus-app.yaml`** (aligned with `sample_micro_app`). The template now ships a repo-root `sensolus-app.yaml` as the single source of truth for the app manifest — read by the Agent Manager at registration time (its `build:` block drives the Jenkins pipeline) and baked into the Docker image so `/.well-known/sensolus-app` serves identical content at runtime. `backend/app.py` replaces the hardcoded `APP_DESCRIPTOR` dict with a loader that reads `sensolus-app.(yaml|yml|json)` from the project root and strips the registration-only `build:` block. Adds `pyyaml==6.0.3` to `backend/requirements.txt` and a `COPY sensolus-app.yaml ./` step to the Dockerfile. The scaffolder already substitutes `{{APP_NAME}}` in `.yaml` files, so the descriptor is templated like everything else. Template `CLAUDE.md` documents the pattern.
- **README corrections.** Map keys (`MAPBOX_KEY`, `LOCATIONIQ_KEY`) documented as optional (OSM fallback) instead of required; app-descriptor references point to `sensolus-app.yaml` instead of the removed `APP_DESCRIPTOR` dict; generated layout lists `sensolus-app.yaml`, `.vscode/tasks.json`, the `start-*.sh` scripts, and `CLAUDE.md`; quick start uses the scaffolder-created `backend/.venv` and start scripts (the old sequence ran `pip install` from the wrong directory); hardcoded `cloud.sensolus.com` / `prod-sensolus-token` mentions now name the `SENSOLUS_DOMAIN` / `SENSOLUS_COOKIE_NAME` env vars they default from.

## 0.7.11

### `@sensolus/snt-agent-kit`

- **`SntMap` — layer toggle order is stable across clicks.** The bottom-left "Layers" hover panel no longer reorders itself when a toggle is clicked. `registerLayerToggle` now replaces an existing entry in place instead of dropping it and re-appending, so toggles stay in mount order for the lifetime of the map.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.10

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app`

- **Scaffolder auto-creates the backend virtualenv.** After copying the template, `create-snt-agent-app` runs `virtualenv -p python3 .venv` inside the generated `backend/` folder. If `virtualenv` isn't on `PATH`, the scaffolder prints a warning with the install/manual command and continues — the app still generates cleanly.
- **Ships a `.vscode/tasks.json`.** The template now seeds a `.vscode/tasks.json` (packaged as `_vscode/tasks.json` and renamed at scaffold time) with tasks to install deps and start the Vite frontend + Flask backend side-by-side. The default build task is `Start Dev (Frontend + Backend)` (parallel).
- **Post-scaffold "Next steps" rewritten.** Recommends the VS Code build task first and the `start-frontend.sh` / `start-backend.sh` scripts as the terminal fallback. Also flags `MAPBOX_KEY` and `LOCATIONIQ_KEY` as optional (matching 0.7.9's `SntMap` OSM fallback) rather than required. `_env.example` gets matching per-key comments.
- **Kit dependency bumped in the frontend template.** The generated `frontend/package.json` now depends on `@sensolus/snt-agent-kit@^0.7.10` (was `^0.4.0`). Because npm's caret rule for `0.x` versions locks to the minor, `^0.4.0` was resolving to `0.4.x` — a version that predates `SNT_ICON_NAMES`, `SntIcon`, `SntSection`, `SntLink`, and other symbols the template's `WidgetShowcase.jsx` imports, so fresh scaffolds failed at dev-server startup with `does not provide an export named 'SNT_ICON_NAMES'`.

## 0.7.9

### `@sensolus/snt-agent-kit`

- **`SntMap` — `mapboxKey` and `locationiqKey` are now optional.** When `locationiqKey` is omitted, street tiles fall back to OpenStreetMap. When `mapboxKey` is omitted, the satellite layer + toggle are hidden (OSM has no free satellite equivalent). This lets the widget-showcase and other keyless setups render maps without any provider account.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.8

### `@sensolus/snt-agent-kit`

- Version bump only (publish parity).

### `@sensolus/create-snt-agent-app`

- **Template reorganized around a `frontend/` folder.** All frontend files (`src/`, `index.html`, `vite.config.js`, `package.json`, `eslint.config.js`) now live under `frontend/`. Backend serves the build from `frontend/dist/`; the Dockerfile builds inside `/app/frontend`. Dev workflow is `cd frontend && npm install / npm run dev`.
- **Scaffolder README rewritten around the full app.** Widget kit component reference and provider API details were removed — see `@sensolus/snt-agent-kit` for those. The scaffolder README now covers generated-app layout, how frontend/backend connect, end-user + manager auth, runtime config, database + migrations, background jobs (APScheduler vs platform cron), realtime, and Docker/Jenkins deploy.

## 0.7.7

### `@sensolus/snt-agent-kit`

- **`SntTable` — per-column `width`.** Column definitions accept an optional `width` (number → pixels, or any CSS string like `'20%'` / `'8rem'`), applied inline to both `<th>` and `<td>`. Combined with the existing `table-layout: fixed`, this pins columns to the width you specify.
- **`SntTable` — cells wrap instead of truncating.** Long values now wrap to a new line and the row grows to fit (previously the cell showed an ellipsis and clipped). Unbreakable strings like API keys and UUIDs break at any character (`overflow-wrap: anywhere`) so they stay inside the column. Headers remain single-line so sort icons stay next to the label.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.6

### `@sensolus/snt-agent-kit`

- **`SntDateRangePicker` — Custom now opens the calendar.** Clicking the **Custom** chip opens the calendar popover so a range can be picked, even when it is already the active view mode and even when `navigable={false}` hides the usual date-display trigger. The popover anchors to the mode/preset button group when the nav display isn't rendered.
- **Year-based preset labels.** `last_12_months` / `last_24_months` / `last_36_months` now read "Last year" / "Last 2 years" / "Last 3 years" (was "Last 12/24/36 months") across en/nl/fr/de/es.
- **`last_year` relabelled to "Previous year"** (and localized equivalents) to disambiguate the rolling `last_12_months` ("Last year") from the previous-calendar-year preset.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.5

### `@sensolus/snt-agent-kit`

- **`SntDateRangePicker` — finance / period presets.** Extended `DATE_RANGE_PRESETS` (and `getPresetRange`) with rolling and calendar-period presets: `last_3_months`, `last_6_months`, `last_12_months`, `last_24_months`, `last_36_months`, `this_quarter`, `previous_quarter`, `this_year`, `last_year`, `all_time`, plus future-inclusive `next_3_months`, `next_6_months`, `next_12_months`, `next_quarter`, and the centred `rolling_12_months`. Drop any subset into `modes={[...]}`. Translations added across en/nl/fr/de/es.
- **`SntDateRangePicker` — `customPresets` prop.** Inject consumer-defined presets not in the built-in catalog as `{ key: { label, getRange: (now) => ({ start, end }) } }` and reference the key in `modes`. Consulted by label rendering, range resolution, and active-preset detection.
- **`SntDateRangePicker` — preset selections are no longer clamped to `maxDate`.** Picking a preset (built-in or custom) emits its full range, so future-inclusive presets resolve correctly even with the default `maxDate` of today. Manual calendar selection still respects `minDate`/`maxDate`.
- **`getDefaultDateRange(key)`.** Now also accepts a preset key (e.g. `getDefaultDateRange('last_12_months')`), returning a `{ viewMode: 'custom', start, end }` value that the picker auto-highlights. Passing a view mode (`'day'|'week'|'month'|'custom'`) is unchanged.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.4

### `@sensolus/snt-agent-kit`

- **`SntDateRangePicker` — `direction` prop.** New `direction="vertical"` stacks the nav above the mode group and lets the mode/preset buttons wrap as standalone chips, suited to a sidebar "column of filters". Default `"horizontal"` is unchanged.
- **`SntDateRangePicker` — `navigable` prop.** New `navigable={false}` renders the period as a static, slightly bolder label (`.snt-drp-label`) with no `< >` arrows and no calendar popover; the mode/preset buttons still drive the range. Default `true` is unchanged. Ignored when `hideNav` is set.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.3

### `@sensolus/snt-agent-kit`

- **New widgets.** Added `SntIcon` (with the `SNT_ICON_NAMES` catalog), `SntLink`, `SntMultiSelect`, and `SntSection`, all exported from `widgets/index.js`.
- **`SntBadge` dot variant.** New `dot` prop renders a leading 8px solid status dot (`.snt-badge--dot`) for status indications; the plain label badge remains the default.
- **`SntMultiSelect`.** Multi-select dropdown with i18n keys `multiSelect.placeholder` and `multiSelect.count(n)` added across en/nl/fr/de/es.
- **New exports.** `SntColors` now also exports `SntBadgeColors` and `SNT_PALETTE_GROUPS`; `SntHistogram` exports `SNT_HISTOGRAM_COLORS`; the map module exports `createDeviceIcon`.
- **Map.** `SntDeviceLayer` reworked to build markers via `createDeviceIcon`; minor `SntMarkerClusterLayer` adjustment.
- **Polish.** Typography and theme refresh (large `snt-theme.css` update), plus `SntButton`, `SntButtonGroup`, `SntCheckboxList`, `SntSummaryStat`, and card state styling tweaks.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.1

### `@sensolus/snt-agent-kit`

- **Breaking — `SntDateRangePicker` unified choice group.** The separate preset row introduced in 0.7.0 is gone. Built-in modes (`day`, `week`, `month`, `custom`) and relative-period preset keys (`last_7d`, `last_30d`, `this_month`, …) now live in a single segmented button group — they're all just choices the caller can opt into. The `modes` prop accepts any mix of built-in modes and `DATE_RANGE_PRESETS` keys, in the order they should render; `custom` auto-sorts to the end if included. Default is unchanged: `['day','week','month','custom']`. Clicking a preset key emits `viewMode='custom'` with the computed range; the preset stays highlighted (preset-key match wins over a `viewMode === 'custom'` match), so callers see "Last 7 days" lit up rather than "Custom".
- **Removed (vs 0.7.0):** the `presets` and `onPresetChange` props on `SntDateRangePicker` — fold any preset keys you were passing into `modes` instead. Also removed: the `dateRange.preset.group` i18n key, the `.snt-drp-presets` / `.snt-drp-preset` CSS classes, and the second render block in the picker. `DATE_RANGE_PRESETS` and `getPresetRange()` exports are kept.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.7.0

### `@sensolus/snt-agent-kit`

- **New — `SntDateRangePicker presets` prop.** Optional array of relative-period preset keys; renders a chip row above the nav that, on click, sets the picker's range to `now − N` … `now` with `viewMode='custom'`. Active preset is detected by matching the current value against each preset's computed range within ±5 min — no extra state on the picker. Catalog (exported as `DATE_RANGE_PRESETS`): `last_48h`, `last_7d`, `last_14d`, `last_30d`, `last_60d`, `last_90d`, `last_180d`, `last_365d`, `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`. Optional `onPresetChange(key, value)` fires alongside `onChange` when a preset chip is clicked. Default value of the prop is `undefined`, so no row renders and existing usages are unaffected. Also exported: `getPresetRange(key, now?, weekStart?)` so callers can compute defaults without rendering the picker.
- **i18n:** added `dateRange.preset.group` + `dateRange.preset.<key>` for all 14 catalogued presets across en/nl/fr/de/es.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.6.0

### `@sensolus/snt-agent-kit`

- **Breaking — `SntTable` default sizing.** `.snt-table-container` no longer hardcodes `max-height: calc(100vh - 120px)`. The default is now `height: 100%; min-height: 0` so the table fills its parent — which is the right behavior when nested inside a side panel, dialog, card, or tab pane. Top-level pages that relied on the implicit viewport cap must now either give the parent a bounded height (e.g. a flex column with `min-height: 0` on the table) or pass `<SntTable scroll="viewport" viewportOffset={120} />` to opt back into the old behavior.
- **New — `SntTable scroll` prop.** Three modes: `"internal"` (default, table fills parent and body scrolls inside with sticky header + footer), `"none"` (natural height, no inner scroller — the surrounding page/column owns the scroll), `"viewport"` (cap at `calc(100vh - viewportOffset)px`, opt-in for genuinely viewport-pinned tables). Accompanied by a numeric `viewportOffset` prop (default `120`).
- **New — `SntTabs fillHeight` prop.** Additive (default `false`, no behavior change for existing usage). When set, the tab strip, the content area, and the active panel all stretch to fill the parent's height — so a `<SntTable>` placed inside a `<SntTabPanel>` can resolve `height: 100%` against a bounded container instead of collapsing to 0. Replaces the three consumer CSS overrides (`.snt-tabs-content > *`, `.snt-tabs-content`, container `min-height: 0`) that were previously required to make this work.
- **New — `SntDialog scroll` prop.** `"auto"` (default — dialog body keeps its existing `overflow-y: auto` behavior) or `"none"` (dialog body does not scroll, so a fill-capable child like `<SntTable scroll="internal">` can own the scroll without producing a double scrollbar). Also added `min-height: 0` to `.snt-dialog-content` so nested flex children size correctly.
- **Docs:** new "Sizing model" section in the repo `README` covering the consumer contract — parents must give fill-capable components a bounded height, and the `scroll` / `fillHeight` props are the supported way to pick a layout. Don't override agent-kit internal selectors from consumer CSS.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.5.5

### `@sensolus/snt-agent-kit`

- **Fix:** the new top-right map buttons (current location, zoom to all) shipped in 0.5.4 rendered as empty white boxes. Vite inlines the small SVG icons as `data:image/svg+xml,…` URIs containing literal single quotes, and `url(${icon})` produced an unquoted CSS `url()` token with quotes inside it — which the browser rejects, dropping `background-image`. Now wrapping the URL in quotes (`url("${icon}")`) so any future icon containing quotes/parens/whitespace also works.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.5.4

### `@sensolus/snt-agent-kit`

- **New:** `SntMap` now exposes two extra top-right map controls matching the Sensolus platform: a **current-location** button (geolocates the user and pans the map) and a **zoom-to-all** button. The current-location button is on by default and can be hidden with `showCurrentLocation={false}`. The zoom-to-all button only appears when the consumer passes an `onZoomToAll(map)` callback — the kit doesn't know what "all" means, so the consumer decides (typically `map.fitBounds(...)`).

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.5.3

### `@sensolus/snt-agent-kit`

- **Fix:** `SntTable` now hides the page-size selector and pagination buttons when all rows fit within the smallest available page size — no more dangling "Show 25 / 1" controls under a 13-row table. The footer text also simplifies from "Showing 1 - 13 of 13 items" to "Showing 13 items" in that case (new `table.showingTotal` translation key, translated in en/es/fr/nl/de).

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.5.2

### `@sensolus/snt-agent-kit`

- **New:** `SntSummaryStat` now accepts an optional `hint` prop — a secondary description rendered below the label, useful for explaining what a stat tile actually counts.

### `@sensolus/create-snt-agent-app`

- Version bump only (publish parity).

## 0.4.0

### `@sensolus/snt-agent-kit`

- **New:** `SntMessage` — inline message box (colored left border + tinted background). Variants: `info`, `success`, `warning`, `danger`; omit `variant` for a neutral grey box. Body is `children` — compose any layout (paragraphs, footer lines, dividers) inside.

### `@sensolus/create-snt-agent-app`

- Template now depends on `@sensolus/snt-agent-kit@^0.4.0`.

## 0.3.0

### `@sensolus/snt-agent-kit`

**Composable map API.** `SntMap` was split from a do-everything widget into a base primitive plus layer components. Consumers can now mix and match (custom marker icons, multiple clustered groups, custom popups, status-based coloring) without dropping down to raw Leaflet.

- **New:** `SntMap` is now the base primitive — owns tile layers, street/satellite toggle, zoom/scale controls, and geocoder. Renders no domain layers.
- **New:** `useSntMap()` hook exposes `{ map, L, registerLayerToggle }` to child layers.
- **New:** `SntGeozoneLayer` — geozone rendering, opts into the base map via context. Selector toggle plugs into the base's hover panel via `registerLayerToggle`.
- **New:** `SntDeviceLayer` — Sensolus device markers with default icon/popup. `renderPopup` and `getMarkerIcon` props for light theming; `cluster={false}` for plain markers.
- **New:** `SntMarkerClusterLayer` — generic clustered markers; the workhorse for any "show a bunch of dots with clustering" need.
- **New:** `SntDeviceMap` — opinionated convenience wrapper preserving the pre-0.3 `SntMap(devices=, geozones=, ...)` API. Use this for one-line migration; reach for `SntMap` + layer components when you need anything custom.

**Breaking:** `SntMap` no longer accepts `devices`, `geozones`, `orgId`, `showDevices`, `showGeozones`, `showGeozoneSelector`. Migrate to `SntDeviceMap` (drop-in) or compose layers explicitly.

### `@sensolus/create-snt-agent-app`

- Template now depends on `@sensolus/snt-agent-kit@^0.3.0`.
- `OrganisationDetail.jsx` migrated to `SntDeviceMap` (drop-in rename).
- `WidgetShowcase.jsx` showcases the composable form: `<SntMap>` + `<SntDeviceLayer>`.

## 0.2.0

Merged `@sensolus/snt-ui` v0.2.x widget code into the kit; the kit is now the master copy.

## 0.1.1

Republish.

## 0.1.0

Initial monorepo: `@sensolus/snt-agent-kit` + `@sensolus/create-snt-agent-app`.
