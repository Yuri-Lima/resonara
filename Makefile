.PHONY: build test lint ui piano docker-up docker-down verify-ffmpeg seed-piano farm-stop farm-status farm-cancel

build:
	npm run build

test:
	npm test

lint:
	npm run lint

ui:
	bash scripts/open-ui.sh

piano:
	bash scripts/open-piano.sh

seed-piano:
	bash scripts/seed-piano-pack.sh

verify-ffmpeg:
	bash scripts/verify-ffmpeg.sh

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down -v

farm-status:
	@curl -sf http://127.0.0.1:$${FARM_STATUS_PORT:-3861}/farm/status | python3 -m json.tool || node scripts/render-farm.js status

farm-cancel:
	node scripts/render-farm.js cancel

farm-stop:
	node scripts/render-farm.js cancel || true
	@# reap lite + status ports
	-@lsof -tiTCP:$${FARM_PORT:-3860} -sTCP:LISTEN 2>/dev/null | xargs kill -TERM 2>/dev/null || true
	-@lsof -tiTCP:$${FARM_STATUS_PORT:-3861} -sTCP:LISTEN 2>/dev/null | xargs kill -TERM 2>/dev/null || true
	-@lsof -tiTCP:3847 -sTCP:LISTEN 2>/dev/null | xargs kill -TERM 2>/dev/null || true
	-@test -f farm-output/lite-server.pid && kill $$(cat farm-output/lite-server.pid) 2>/dev/null || true
	-@test -f .resonara-ui.pid && kill $$(cat .resonara-ui.pid) 2>/dev/null || true
	@rm -f farm-output/farm.lock farm-output/lite-server.pid .resonara-ui.pid 2>/dev/null || true
	@echo "farm-stop complete"
