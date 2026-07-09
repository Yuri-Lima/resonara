#!/usr/bin/env bash
# Generate synthetic upright-basic sample pack (C2–C6 = 49 keys) and optional MinIO upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/samples/upright-basic"
NOTES_DIR="${OUT}/notes"
mkdir -p "$NOTES_DIR"

# MIDI note name helper via awk
midi_to_name() {
  local midi=$1
  local names=(C C# D D# E F F# G G# A A# B)
  local n=$((midi % 12))
  local oct=$((midi / 12 - 1))
  echo "${names[$n]}${oct}"
}

freq_for_midi() {
  # A4=440, midi 69
  python3 -c "print(440.0 * (2 ** (($1 - 69) / 12.0)))"
}

echo "Generating 49-key synthetic pack (MIDI 36..84)..."
NOTES_JSON="["
FIRST=1
for midi in $(seq 36 84); do
  name=$(midi_to_name "$midi")
  # sanitize filename: C#4 -> Cs4
  fname=$(echo "$name" | sed 's/#/s/g')
  freq=$(freq_for_midi "$midi")
  # duration scales slightly shorter for high notes
  dur=$(python3 -c "print(max(1.2, 3.5 - ($midi - 36) * 0.04))")
  out="${NOTES_DIR}/${fname}.mp3"
  # hammer-ish: short noise burst + decaying sine harmonics
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "sine=frequency=${freq}:duration=${dur}:sample_rate=44100" \
    -f lavfi -i "sine=frequency=$(python3 -c "print($freq*2)"):duration=${dur}:sample_rate=44100" \
    -f lavfi -i "anoisesrc=d=0.03:c=pink:r=44100:a=0.15" \
    -filter_complex "\
      [0]volume=0.55,afade=t=in:st=0:d=0.005,afade=t=out:st=$(python3 -c "print(max(0.1,$dur-0.8))"):d=0.75[a0];\
      [1]volume=0.18,afade=t=in:st=0:d=0.005,afade=t=out:st=$(python3 -c "print(max(0.1,$dur-0.5))"):d=0.45[a1];\
      [2]afade=t=out:st=0:d=0.03[n];\
      [a0][a1]amix=inputs=2:duration=longest:dropout_transition=0,volume=1.2[h];\
      [h][n]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[out]" \
    -map "[out]" -c:a libmp3lame -b:a 128k "$out"

  if [[ $FIRST -eq 1 ]]; then FIRST=0; else NOTES_JSON+=","; fi
  NOTES_JSON+=$(printf '{"midi":%s,"name":"%s","key":"notes/%s.mp3","durationSec":%s}' "$midi" "$name" "$fname" "$dur")
  printf "  %s (%.1f Hz)\n" "$name" "$freq"
done
NOTES_JSON+="]"

cat > "${OUT}/manifest.json" << MANIFEST
{
  "id": "upright-basic",
  "name": "Upright Basic (synthetic)",
  "format": "mp3",
  "sampleRate": 44100,
  "baseNote": "C2",
  "notes": ${NOTES_JSON},
  "velocityLayers": [{ "id": "mf", "min": 0, "max": 127 }],
  "releaseMs": 80,
  "maxPolyphony": 32,
  "license": "CC0 synthetic seed for development",
  "keyRange": { "low": 36, "high": 84 }
}
MANIFEST

echo "Wrote ${OUT}/manifest.json ($(ls "$NOTES_DIR" | wc -l | tr -d ' ') notes)"

# Optional: register via API if running
API="${API_URL:-http://localhost:43000}"
if curl -sf "${API}/health" >/dev/null 2>&1; then
  echo "API up — register pack by restarting API (auto-seed) or POST later"
else
  echo "API not running; pack is local under samples/upright-basic (auto-seeded on API boot)"
fi
