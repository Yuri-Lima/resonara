.PHONY: build test lint ui piano docker-up docker-down verify-ffmpeg seed-piano

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
