# Last Stable Orbit. Everything runs in Docker except the server tests (uv).
.PHONY: help env passcode passcodes up down logs dev sandbox sandbox-down test test-server test-web reset-world

help:
	@echo "make env          write .env with a random secret and a GM passcode (once)"
	@echo "make passcode     show the GM passcode (players just pick their character)"
	@echo "make up           build and run the app on http://localhost:8070"
	@echo "make logs         follow the app's logs"
	@echo "make down         stop everything"
	@echo "make dev          hot-reloading dev setup on http://localhost:5173"
	@echo "make sandbox      a fresh copy of your save with the Bench, hot-reloading, on http://localhost:8072 (passcode: test)"
	@echo "make sandbox-down stop the sandbox"
	@echo "make test         server tests (uv) and web tests (docker)"
	@echo "make reset-world  wipe the app's saved game and reload the default preset"

env:
	$(shell command -v python3 || echo uv run --no-project python) scripts/make_env.py

passcode passcodes:
	@grep '^LSO_GM_PASSCODE=' .env | cut -d= -f2-

up:
	docker compose up --build -d app
	@echo "Running on http://localhost:8070 (or your LSO_PORT)"

down:
	docker compose --profile dev down

logs:
	docker compose logs -f app

dev:
	docker compose --profile dev up --build api web

sandbox:
	docker compose --profile sandbox stop sandbox sandbox-web
	docker volume create lso_lso-sandbox-data >/dev/null
	docker run --rm -v lso_lso-data:/from:ro -v lso_lso-sandbox-data:/to alpine sh -c "rm -f /to/*; cp -a /from/. /to/"
	docker compose --profile sandbox up --build -d sandbox sandbox-web
	@echo "Sandbox on http://localhost:8072 (GM passcode: test). Your real save is untouched."

sandbox-down:
	docker compose --profile sandbox stop sandbox sandbox-web

test: test-server test-web

test-server:
	cd server && uv run pytest -q

test-web:
	docker run --rm -v "$(CURDIR)":/repo -v lso-web-node-modules:/repo/web/node_modules -w /repo/web node:22-alpine \
		sh -c "npm ci --no-audit --no-fund --loglevel=error && npx tsc -b && npx vitest run"

reset-world:
	docker compose stop app
	docker compose run --rm --no-deps --entrypoint sh app -c "rm -f /data/lso.db /data/lso.db-wal /data/lso.db-shm"
	docker compose up -d app
