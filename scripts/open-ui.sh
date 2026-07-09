#!/usr/bin/env bash
# Open the Audio Pipeline dashboard in the default browser (local file URL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI="${ROOT}/ui/index.html"
if [[ ! -f "$UI" ]]; then
  echo "UI not found at $UI" >&2
  exit 1
fi
URL="file://${UI}"
echo "Opening $URL"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "Open manually: $URL"
fi
