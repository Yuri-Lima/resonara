.PHONY: build test lint ui docker-up docker-down verify-ffmpeg

build:
	npm run build

test:
	npm test

lint:
	npm run lint

ui:
	bash scripts/open-ui.sh

verify-ffmpeg:
	bash scripts/verify-ffmpeg.sh

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down -v
