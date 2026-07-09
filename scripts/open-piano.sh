#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Prefer live API static mount when available
API="${API_URL:-http://localhost:43000}"
if curl -sf "${API}/health" >/dev/null 2>&1; then
  URL="${API}/ui/piano/"
else
  URL="file://${ROOT}/ui/piano/index.html"
fi
echo "Opening $URL"
if command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
else echo "Open manually: $URL"; fi
