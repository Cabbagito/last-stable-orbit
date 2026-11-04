# syntax=docker/dockerfile:1
# One image: node builds the web app, python serves it plus the API and the WebSocket on one port.

FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund --loglevel=error
COPY web/ ./
RUN npm run build

FROM python:3.12-slim AS app
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv PATH=/opt/venv/bin:$PATH \
    LSO_DATA_DIR=/data FORWARDED_ALLOW_IPS=*
WORKDIR /app/server
COPY server/pyproject.toml server/uv.lock server/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server/lso ./lso
COPY content /app/content
COPY assets /app/assets
COPY --from=web /web/dist /app/web/dist
EXPOSE 8000
# No VOLUME line: Railway rejects it. Attach a volume at /data instead (compose does it locally).
# One worker on purpose: the game state lives in this process.
CMD ["sh", "-c", "exec uvicorn --factory lso.main:app_factory --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --ws-ping-interval 20 --proxy-headers"]
