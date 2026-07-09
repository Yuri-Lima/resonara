# Audio Processing Service

Production NestJS service for **upload → probe → queue → ffmpeg → MinIO → stream**.

| Capability | Implementation |
|------------|----------------|
| Transcode | MP3 / AAC (native) / FLAC / OGG Vorbis / Opus / WAV |
| Loudness | **Two-pass** EBU R128 `loudnorm` (not single-pass) |
| Waveform | Streamed f32le PCM → JSON `[min,max]` + RMS |
| Metadata | ffprobe + tags + cover art |
| Silence | `silencedetect` |
| Trim / fade | Sample-accurate + `afade` curves |
| Delivery | HTTP Range `206` + MinIO presigned URLs |

Architecture details: **[AUDIO_ARCHITECTURE.md](./AUDIO_ARCHITECTURE.md)**  
Interactive dashboard: **[ui/index.html](./ui/index.html)** · `make ui`

## Stack

- NestJS 10, fluent-ffmpeg, BullMQ (Redis), PostgreSQL, MinIO, Socket.IO
- ffmpeg with **libsoxr**, LAME, Vorbis, Opus (see `scripts/verify-ffmpeg.sh`)

## Quick start (local)

```bash
# Dependencies
cp .env.example .env
docker compose up -d postgres redis minio minio-init
npm install
npm run build
npm run start:dev   # API :3000  — Swagger /docs
# optional dedicated worker:
# FFMPEG_CONCURRENCY=2 node dist/worker.js
```

## Format support matrix

| In \ Out | MP3 | AAC | FLAC | OGG | Opus | WAV |
|----------|-----|-----|------|-----|------|-----|
| MP3      | ✓   | ✓   | ✓    | ✓   | ✓    | ✓   |
| AAC/M4A  | ✓   | ✓   | ✓    | ✓   | ✓    | ✓   |
| FLAC     | ✓*  | ✓   | ✓    | ✓   | ✓    | ✓   |
| OGG/Opus | ✓   | ✓   | ✓    | ✓   | ✓    | ✓   |
| WAV/AIFF | ✓*  | ✓   | ✓    | ✓   | ✓    | ✓   |

\* High-rate / high-bit-depth sources use **soxr** resampling and **TPDF dither** (`dither_method=triangular`) when reducing to 16-bit.

### Quality knobs

| Format | Options |
|--------|---------|
| MP3 | CBR 128/192/256/320 or VBR V0–V9 (`quality` 0–9) |
| AAC | 128/192/256 kbps (**native** encoder — not libfdk_aac) |
| FLAC | compression 0–8 |
| OGG | quality −1…10 |
| Opus | 64–256 kbps |
| WAV | 16/24/32-bit, 44.1/48/96 kHz |

## Loudness normalization guide

**Always two-pass:**

1. **Measure:** `loudnorm=I=<target>:TP=<tp>:LRA=<lra>:print_format=json` → parse `input_i`, `input_lra`, `input_tp`, `input_thresh`, `target_offset`
2. **Apply:** feed `measured_*` + `offset` + `linear=true`

| Profile | LUFS | True peak | LRA |
|---------|------|-----------|-----|
| Spotify | −14 | −1 dBTP | 11 |
| Podcast | −16 | −1.5 dBTP | 11 |
| EBU R128 | −23 | −1 dBTP | 7 |

Acceptance: output integrated loudness within **±0.5 LUFS** of target.

```http
POST /tracks/:id/normalize
{ "profile": "spotify" }
# or { "targetLufs": -14, "truePeak": -1, "lra": 11 }
```

## API (summary)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/tracks/upload` | Magic-byte validation |
| POST | `/tracks/:id/transcode` | Enqueue conversion |
| POST | `/tracks/:id/normalize` | Two-pass loudnorm job |
| GET | `/tracks/:id/waveform?resolution=1800` | Peaks + RMS JSON |
| GET | `/tracks/:id/metadata` | ffprobe + tags |
| GET | `/tracks/:id/silence` | Silence regions |
| POST | `/tracks/:id/trim` | Trim + fade job |
| GET | `/tracks/:id/stream` | Range / 206 |
| GET | `/tracks/:id/download` | Presigned URL |
| GET | `/jobs/:id` | Progress / result |
| GET | `/health` | DB, Redis, ffmpeg |
| WS | `/jobs` | `subscribe` → `job:progress` |

Full OpenAPI: `http://localhost:3000/docs`

## Constraints (enforced)

- No single-pass loudnorm
- No default SWR for sample-rate conversion — **soxr only**
- No full-file Node buffers — streams / temp files
- Always ffprobe before process
- ffmpeg path from `PATH` or `FFMPEG_PATH` / `FFPROBE_PATH`
- Worker concurrency = `FFMPEG_CONCURRENCY` (default CPU count); queue backpressure, not rejection

## Gapless limitation

Album-gapless MP3 requires LAME `--nogap` multi-file encode. Per-file transcodes may retain LAME delay/padding tags but true album gapless is **not** implemented in v1. Prefer FLAC/Opus for seamless albums.

## Tests

```bash
npm test                 # unit + ffmpeg fixtures
make verify-ffmpeg
```

## Docker Compose full stack

```bash
docker compose up --build
```

Services: `api`, `worker`, `postgres`, `redis`, `minio`.

## UI

```bash
make ui                  # opens ui/index.html
```

Dark-themed dashboard: codec matrix, loudness visualizer, waveform canvas, filter graphs, queue simulator.

## Hybrid Piano

Sample-based piano + live meters + server analysis (see [PIANO_ARCHITECTURE.md](./PIANO_ARCHITECTURE.md)).

```bash
# Generate synthetic 49-key pack (C2–C6)
make seed-piano
# Start API (auto-registers samples/upright-basic into MinIO + DB)
npm run build && npm start
# Open piano UI (same-origin /ui/piano/)
make piano
```

Play with mouse/touch, QWERTY, or MIDI. **Record** uploads a take and runs waveform + silence + loudness measure. **Export** enqueues two-pass normalize (−14 LUFS).

## License

MIT
