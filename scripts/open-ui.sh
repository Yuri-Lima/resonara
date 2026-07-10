#!/usr/bin/env bash
# Open the Resonara TTS improvement dashboard with a live API so Play buttons work.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${RESONARA_UI_PORT:-3847}"
URL="http://127.0.0.1:${PORT}/ui/deliverable/"

need_build=0
if [[ ! -f "$ROOT/dist/main.js" ]]; then
  need_build=1
fi
if [[ "$need_build" -eq 1 ]]; then
  echo "Building…"
  (cd "$ROOT" && npm run build)
fi

# Start lite server if health is not already up on PORT
if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "Starting Resonara lite API on :${PORT}…"
  (
    cd "$ROOT"
    export RESONARA_LITE=1
    export PORT
    export PIPER_PATH="${PIPER_PATH:-$ROOT/tools/piper-venv/bin/piper}"
    export PIPER_MODELS_DIR="${PIPER_MODELS_DIR:-$ROOT/resources/piper/models}"
    nohup node dist/main.js >"$ROOT/.resonara-ui.log" 2>&1 &
    echo $! >"$ROOT/.resonara-ui.pid"
  )
  # Wait for health
  for i in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "Server failed to start. See $ROOT/.resonara-ui.log" >&2
    exit 1
  fi
  echo "API ready (pid $(cat "$ROOT/.resonara-ui.pid" 2>/dev/null || echo '?'))"
else
  echo "API already running on :${PORT}"
fi

echo "Opening $URL"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "Open manually: $URL"
fi
