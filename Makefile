# Last Stable Orbit. Everything runs in Docker except the server tests (uv).
.PHONY: help env passcode passcodes up down logs dev test test-server test-web reset-world

help:
	@echo "make env          write .env with a random secret and a GM passcode (once)"
	@echo "make passcode     show the GM passcode (players just pick their character)"
	@echo "make up           build and run the app on http://localhost:8070"
	@echo "make logs         follow the app's logs"
	@echo "make down         stop everything"
	@echo "make dev          hot-reloading dev setup on http://localhost:5173"
	@echo "make test         server tests (uv) and web tests (docker)"
	@echo "make reset-world  wipe the app's saved game and reload the default preset"

env:
	python3 scripts/make_env.py

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
