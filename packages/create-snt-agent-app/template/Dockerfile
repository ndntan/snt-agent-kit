# Build stage - build the React frontend
FROM node:20-slim AS builder

WORKDIR /app/frontend

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build

# Production stage - serve with Flask
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Flask app and built frontend
COPY backend/ backend/
COPY --from=builder /app/frontend/dist frontend/dist/
# Single-source app descriptor (served at /.well-known/sensolus-app at runtime).
# PROJECT_ROOT in app.py resolves to /app, so it must live at the image root.
COPY sensolus-app.yaml ./

# Run as non-root user
RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --no-create-home app \
 && chown -R app:app /app
USER app

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

# gunicorn, not `python backend/app.py`. That ran Flask's development server
# (Werkzeug) in the container, and Flask-SocketIO refuses to start it when
# there is no terminal attached — every scaffolded app failed to boot in the
# Agent Manager with "The Werkzeug web server is not designed to run in
# production" (STIC-16081). Socket.IO keeps working under gunicorn: the
# threading async mode serves WebSocket through simple-websocket, which
# supports gunicorn's threaded workers.
#
#   --chdir backend  app.py imports its siblings by bare name (db_config,
#                    models, ...), so backend/ must be the working directory.
#   --workers 1      APScheduler runs in-process and the bootstrap applies
#                    migrations at import; a second worker would duplicate both.
#   --threads 8      concurrency comes from threads, matching async_mode
#                    'threading'.
#   --timeout 600    long-running requests (a cron job, a big proxy call) must
#                    not be killed at gunicorn's 30s default.
CMD ["gunicorn", "--chdir", "backend", "--workers", "1", "--threads", "8", \
     "--timeout", "600", "--access-logfile", "-", "--bind", "0.0.0.0:5000", "app:app"]
