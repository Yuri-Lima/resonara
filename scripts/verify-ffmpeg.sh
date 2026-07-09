#!/usr/bin/env bash
set -euo pipefail
FFMPEG_BIN="${FFMPEG_PATH:-ffmpeg}"
FFPROBE_BIN="${FFPROBE_PATH:-ffprobe}"
command -v "$FFMPEG_BIN" >/dev/null
command -v "$FFPROBE_BIN" >/dev/null
"$FFMPEG_BIN" -hide_banner -filters 2>&1 | grep -q loudnorm
"$FFMPEG_BIN" -hide_banner -filters 2>&1 | grep -q silencedetect
"$FFMPEG_BIN" -hide_banner -filters 2>&1 | grep -q afade
"$FFMPEG_BIN" -hide_banner -encoders 2>&1 | grep -q libmp3lame
"$FFMPEG_BIN" -hide_banner -encoders 2>&1 | grep -q libopus
"$FFMPEG_BIN" -hide_banner -encoders 2>&1 | grep -q libvorbis
"$FFMPEG_BIN" -hide_banner -encoders 2>&1 | grep -q flac
echo "ffmpeg OK: $($FFMPEG_BIN -version | head -1)"
# soxr
if "$FFMPEG_BIN" -hide_banner -h filter=aresample 2>&1 | grep -qi soxr || \
   "$FFMPEG_BIN" -version 2>&1 | grep -q enable-libsoxr; then
  echo "soxr resampler: available"
else
  echo "WARN: soxr may not be compiled in; aresample=resampler=soxr will fail"
fi
