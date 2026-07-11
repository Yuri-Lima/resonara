# Audio Processing Service — Architecture

Production audio pipeline: upload → probe → queue → ffmpeg operations → MinIO storage → stream/download.

**Stack:** NestJS 10 · fluent-ffmpeg · BullMQ · PostgreSQL · MinIO · Socket.IO · Docker Compose

---

## 1. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tracks/upload` | Multipart upload; magic-byte validation; MinIO store; ffprobe metadata; create `Track` |
| `GET` | `/tracks` | List tracks (paginated) |
| `GET` | `/tracks/:id` | Track detail + latest job states |
| `DELETE` | `/tracks/:id` | Soft-delete track + optional object cleanup |
| `POST` | `/tracks/:id/transcode` | Enqueue format conversion (`format`, `bitrate`/`quality`, `sampleRate`, `bitDepth`) |
| `POST` | `/tracks/:id/normalize` | Enqueue **two-pass** EBU R128 loudnorm (`targetLufs`, `truePeak`, `lra`) |
| `GET` | `/tracks/:id/waveform` | Peak/RMS JSON; `?resolution=1800&channels=stereo\|mono`; cached |
| `GET` | `/tracks/:id/metadata` | ffprobe format + tags + cover-art URL |
| `GET` | `/tracks/:id/silence` | Silence segments; `?threshold=-50dB&duration=0.5` |
| `POST` | `/tracks/:id/trim` | Trim + optional fade in/out; enqueue job |
| `GET` | `/tracks/:id/stream` | HTTP Range streaming (206 Partial Content) |
| `GET` | `/tracks/:id/download` | Presigned MinIO URL or attachment stream |
| `GET` | `/jobs/:id` | Job status, progress %, result payload |
| `GET` | `/health` | Liveness: DB, Redis, MinIO, ffmpeg |

**WebSocket (Socket.IO):** namespace `/jobs` — events `job:progress`, `job:completed`, `job:failed`.

---

## 2. Supported Format Matrix

### Input formats (magic-byte validated)

| Format | MIME / magic | Metadata | Notes |
|--------|--------------|----------|-------|
| MP3 | `ID3` / `FF FB` / `FF F3` | ID3v2 | Lossy (LAME decode) |
| AAC / M4A | `ftyp` + `M4A`/`mp42` | iTunes atoms | Lossy |
| FLAC | `fLaC` | Vorbis comments | Lossless |
| OGG Vorbis | `OggS` + Vorbis | Vorbis comments | Lossy |
| Opus | `OggS` + OpusHead | Opus tags | Lossy, speech-optimized |
| WAV | `RIFF....WAVE` | RIFF INFO / BWF | Uncompressed PCM |
| AIFF | `FORM....AIFF` | AIFF NAME/AUTH | Uncompressed PCM |

### Output formats × quality knobs

| Output | Encoder | Quality options | Sample rates | Bit depth | Lossy? | Gapless notes |
|--------|---------|-----------------|--------------|-----------|--------|---------------|
| **MP3** | `libmp3lame` | CBR 128/192/256/320; VBR V0–V9 (`-q:a 0–9`) | 8–48 kHz (codec limits) | N/A | Lossy | LAME delay/padding in LAME tag; true album gapless needs `--nogap` batch (documented limitation — see §7) |
| **AAC** | native `aac` | 128/192/256 kbps | 8–96 kHz | N/A | Lossy | No libfdk_aac (licensing). Encoder delay present; less ideal for gapless albums |
| **FLAC** | `flac` | compression 0–8 | up to 96 kHz+ | 16/24 | **Lossless** | Excellent gapless |
| **OGG Vorbis** | `libvorbis` | quality −1…10 (`-q:a`) | flexible | N/A | Lossy | Good gapless via granulepos |
| **Opus** | `libopus` | 64–256 kbps | 48 kHz internal | N/A | Lossy | Excellent for speech; good gapless |
| **WAV** | `pcm_s16le` / `pcm_s24le` / `pcm_s32le` | N/A | 44.1 / 48 / 96 kHz | 16/24/32 | **Lossless** | Perfect gapless |

### Transcode matrix (input → output)

All listed inputs can convert to all listed outputs. High-rate sources (96 kHz/24-bit FLAC) → consumer formats always use **soxr** resampling + **TPDF dither** when reducing bit depth.

---

## 3. Loudness Normalization Workflow (Two-Pass EBU R128)

**Constraint:** Single-pass `loudnorm` uses a fixed look-ahead buffer and applies dynamic gain — inferior for music with wide dynamics. **Two-pass is mandatory.**

### Targets

| Profile | Integrated (I) | True Peak (TP) | LRA | Use case |
|---------|----------------|----------------|-----|----------|
| Spotify / streaming | **−14 LUFS** | −1 dBTP | 11 | Music platforms |
| Podcast | **−16 LUFS** | −1.5 dBTP | 11 | Spoken word |
| EBU R128 broadcast | −23 LUFS | −1 / −2 dBTP | 7 | Broadcast |
| Custom | user-supplied | user-supplied | user-supplied | Studio |

### Pass 1 — Measure

```text
ffmpeg -i INPUT -af loudnorm=I=<target>:TP=<tp>:LRA=<lra>:print_format=json -f null -
```

Parse JSON from stderr:

| JSON key | Fed back as |
|----------|-------------|
| `input_i` | `measured_I` |
| `input_lra` | `measured_LRA` |
| `input_tp` | `measured_TP` |
| `input_thresh` | `measured_thresh` |
| `target_offset` | `offset` |

### Pass 2 — Normalize (linear)

```text
ffmpeg -i INPUT -af loudnorm=I=<target>:TP=<tp>:LRA=<lra>:measured_I=...:measured_LRA=...:measured_TP=...:measured_thresh=...:offset=...:linear=true -ar <sr> OUTPUT
```

- `linear=true` → single constant gain (preserves dynamics).
- loudnorm internally works at high rate; restore target sample rate with **soxr** if needed.
- Acceptance: measured output integrated loudness within **±0.5 LUFS** of target.

### Filter graph (normalize)

```text
[ain] → loudnorm(two-pass measured params, linear=true) → aresample(soxr) → [aout]
```

---

## 4. Waveform Data Format

UI-oriented peak/RMS extraction. Prefer **raw PCM decode + JS aggregation** for per-sample control and stereo L/R; ffmpeg streams PCM to stdout (never full-file RAM buffer beyond a sliding window).

### JSON schema

```json
{
  "trackId": "uuid",
  "duration": 213.45,
  "sampleRate": 44100,
  "channels": 2,
  "resolution": 1800,
  "peaks": {
    "left":  [[-0.82, 0.91], [-0.45, 0.52]],
    "right": [[-0.79, 0.88], [-0.41, 0.49]],
    "mono":  [[-0.82, 0.91], [-0.45, 0.52]]
  },
  "rms": {
    "left":  [0.21, 0.18],
    "right": [0.20, 0.17],
    "mono":  [0.205, 0.175]
  }
}
```

- Each peak entry is `[min, max]` in normalized float range **[−1, 1]**.
- `resolution` = number of time slices (default **1800** ≈ typical player width).
- Cache key: `waveform:{trackId}:{resolution}:{channels}` in Redis + optional MinIO JSON object.

### Extraction pipeline

```text
ffmpeg -i INPUT -ac <1|2> -f f32le -acodec pcm_f32le pipe:1
  → stream chunks → bin samples into `resolution` buckets → min/max + RMS per bucket
```

**Tradeoff:** ffmpeg `showwaves`/`waveform` video filters are faster for previews but less flexible; raw PCM gives exact control for stereo layers and RMS.

---

## 5. Queue Topology (BullMQ)

```text
                    ┌─────────────┐
  upload complete → │  metadata   │ (sync or quick job: ffprobe + tags)
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐     ┌───────────┐     ┌──────────┐
   │ transcode│     │ normalize │     │ waveform │
   └────┬─────┘     │ (2-pass)  │     └──────────┘
        │           └─────┬─────┘
        │                 │
        ▼                 ▼
   ┌──────────┐     ┌──────────┐
   │  silence │     │   trim   │
   └──────────┘     └──────────┘
```

### Queues

| Queue name | Purpose | Concurrency |
|------------|---------|-------------|
| `audio-transcode` | Format conversion | `min(CPU_COUNT, FFMPEG_CONCURRENCY)` |
| `audio-normalize` | Two-pass loudnorm | same |
| `audio-waveform` | Peak/RMS extract | higher (I/O bound, e.g. 2× cores) |
| `audio-metadata` | Tags + cover art | high |
| `audio-silence` | silencedetect | CPU-bound → core count |
| `audio-trim` | Trim + afade | core count |

### Chaining

Jobs may declare `dependsOn` / parent job ID. Example pipeline:

1. `normalize` completes → auto-enqueue `waveform` refresh  
2. `trim` completes → optional `transcode` to delivery format  

### Backpressure

- Worker concurrency capped at **CPU core count** (env `FFMPEG_CONCURRENCY`, default `os.cpus().length`).
- When all workers busy, new jobs remain **waiting** in Redis (BullMQ default) — **never reject** at API with 503 solely due to load.
- API returns `202 Accepted` + `jobId` immediately after enqueue.

### Progress

fluent-ffmpeg `progress` events → BullMQ `job.updateProgress(pct)` → Socket.IO `job:progress` to room `job:{id}`.

---

## 6. ffmpeg Filter Graph Documentation

### 6.1 Transcode (example: 96 kHz/24-bit FLAC → 44.1 kHz/16-bit MP3 320k)

```text
[ain] aresample=44100:resampler=soxr:precision=28:osf=s16:dither_method=triangular [a1]
# encode: -c:a libmp3lame -b:a 320k
```

MP3 VBR:

```text
-c:a libmp3lame -q:a 0   # V0
```

AAC (native only):

```text
-c:a aac -b:a 192k
```

FLAC:

```text
-c:a flac -compression_level 5
```

OGG Vorbis:

```text
-c:a libvorbis -q:a 5
```

Opus:

```text
-c:a libopus -b:a 128k
```

WAV PCM:

```text
-c:a pcm_s16le | pcm_s24le | pcm_s32le  -ar 44100|48000|96000
```

### 6.2 Two-pass loudnorm

**Pass 1 (measure, null muxer):**

```text
-filter:a loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -
```

**Pass 2 (apply):**

```text
-filter:a loudnorm=I=-14:TP=-1:LRA=11:measured_I=<i>:measured_LRA=<lra>:measured_TP=<tp>:measured_thresh=<th>:offset=<off>:linear=true
```

### 6.3 Silence detection

```text
-af silencedetect=noise=<threshold>:d=<min_duration> -f null -
```

Parse stderr lines:

```text
silence_start: 12.345
silence_end: 15.678 | silence_duration: 3.333
```

Defaults: threshold `−50 dB` (`noise=0.003` linear ≈ −50 dB), duration `0.5s`.

### 6.4 Trim + fade

```text
-ss <start> -to <end> -af afade=t=in:st=0:d=<fadeIn>:curve=qsin,afade=t=out:st=<outStart>:d=<fadeOut>:curve=exp
```

| Curve API name | ffmpeg `curve` |
|----------------|----------------|
| `linear` | `tri` |
| `exponential` | `exp` |
| `logarithmic` | `log` |
| `quarter-sine` | `qsin` |

Crossfade (two segments):

```text
[0:a][1:a] acrossfade=d=<dur>:c1=tri:c2=tri [aout]
```

### 6.5 Waveform (PCM pipe)

```text
-vn -ac 2 -ar 44100 -f f32le -acodec pcm_f32le pipe:1
```

### 6.6 Volume detect (diagnostic)

```text
-af volumedetect -f null -
```

### 6.7 Sample rate + bit depth (mandatory quality path)

**Always** for rate conversion:

```text
-af aresample=<rate>:resampler=soxr:precision=28
```

**Always** for bit-depth reduction to 16-bit:

```text
aresample=...:osf=s16:dither_method=triangular
```

**Never** rely on default SWR alone for production masters.

ffmpeg path: `process.env.FFMPEG_PATH` / `FFPROBE_PATH` or system `PATH` — **never hardcode** `/usr/bin/ffmpeg`.

---

## 7. Hard Problems — Solutions

### 7.1 Two-pass loudness

Implemented as sequential child processes in `FfmpegService.normalize()`:
1. Measure → parse JSON from stderr  
2. Apply with measured_* + `linear=true`  
3. Optional verify pass with `print_format=json` for ±0.5 LUFS check  

### 7.2 Sample rate conversion quality

All transcode/normalize paths that change sample rate inject `aresample=resampler=soxr`. Bit depth 24→16 uses `dither_method=triangular` (TPDF).

### 7.3 Gapless processing (limitation)

| Codec | Gapless capability |
|-------|--------------------|
| FLAC / WAV / AIFF | Perfect (sample-accurate) |
| Opus / Vorbis | Good (container granule positions) |
| MP3 | LAME encoder delay (~576–1105 samples) + padding; album gapless requires LAME `--nogap` multi-file encode or decoder using LAME/Xing delay tags |
| AAC | Encoder delay; gapless needs iTunSMPB / edts atoms |

**Documented limitation:** Per-file MP3/AAC transcodes store encoder delay metadata when the encoder writes it (LAME tag), but true album-gapless batch (`--nogap`) is **not** implemented in v1. Clients needing seamless albums should prefer FLAC/Opus delivery or pre-gapless masters.

### 7.4 Streaming large files

- Upload: multipart stream → MinIO `PutObject` stream (no full buffer).  
- ffmpeg: `-i` from temp path or HTTP; stdout pipe for intermediate PCM; output file written by ffmpeg then streamed to MinIO via `createReadStream`.  
- Node never holds entire 1.2 GB WAV in a `Buffer`.  
- Stream endpoint: MinIO range GET + `Content-Range` / 206.

### 7.5 Concurrent ffmpeg processes

```text
FFMPEG_CONCURRENCY = parseInt(process.env.FFMPEG_CONCURRENCY || String(os.cpus().length), 10)
```

BullMQ workers: `{ concurrency: FFMPEG_CONCURRENCY }`. Queue depth unbounded (Redis); API always enqueues.

### 7.6 Always probe first

Every processing path calls `ffprobe` before ffmpeg. Corrupt/empty files fail fast with structured errors (no hang — timeout + kill).

---

## 8. Data Model (PostgreSQL)

### `tracks`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| original_filename | text | |
| storage_key | text | MinIO object key |
| mime_type | text | |
| format | text | container/codec summary |
| duration_sec | float | |
| sample_rate | int | |
| channels | int | |
| bit_rate | int | nullable |
| bit_depth | int | nullable |
| size_bytes | bigint | |
| metadata_json | jsonb | tags, cover key |
| waveform_key | text | nullable cache object |
| status | enum | `uploaded`, `ready`, `processing`, `error` |
| created_at / updated_at | timestamptz | |

### `transcode_jobs` (generic job table)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| track_id | uuid FK | |
| type | enum | `transcode`, `normalize`, `waveform`, `silence`, `trim`, `metadata` |
| status | enum | `queued`, `active`, `completed`, `failed` |
| progress | int | 0–100 |
| params_json | jsonb | request params |
| result_json | jsonb | outputs, measured LUFS, etc. |
| error_message | text | |
| bull_job_id | text | |
| output_storage_key | text | nullable |
| created_at / updated_at / completed_at | timestamptz | |

---

## 9. Storage (MinIO)

Buckets:

- `audio-originals` — uploaded masters  
- `audio-derivatives` — transcodes, normalized, trimmed  
- `audio-artifacts` — waveforms JSON, cover art  

Keys: `{trackId}/original/{filename}`, `{trackId}/derivatives/{jobId}.{ext}`, `{trackId}/artifacts/waveform-{res}.json`

Presigned URLs: GET expiry configurable (`PRESIGN_TTL_SEC`, default 3600).

---

## 10. Streaming Delivery

`GET /tracks/:id/stream`

1. Resolve storage key (original or `?derivative=jobId`).  
2. Parse `Range: bytes=start-end`.  
3. MinIO `GetObject` with range.  
4. Response: `206 Partial Content`, headers:

```text
Content-Type: audio/<mime>
Accept-Ranges: bytes
Content-Range: bytes start-end/total
Content-Length: (end-start+1)
```

Without Range → `200` full stream (still piped, not buffered).

---

## 11. Docker Compose Topology

| Service | Image / build | Ports |
|---------|---------------|-------|
| `api` | Dockerfile (Node 20 + ffmpeg with soxr, lame, vorbis, opus) | 3000 |
| `worker` | same image, `node dist/worker` | — |
| `postgres` | postgres:16 | 5432 |
| `redis` | redis:7 | 6379 |
| `minio` | minio/minio | 9000, 9001 |
| `minio-init` | mc | create buckets |

Healthchecks on postgres, redis, minio, api.

---

## 12. Security & Validation

- Magic-byte sniffing (`file-type` / custom signatures) — **not** extension alone.  
- Max upload size env (`MAX_UPLOAD_MB`, default 2048).  
- ffmpeg/ffprobe process timeout (`FFMPEG_TIMEOUT_MS`).  
- Kill hung processes; never leave zombie ffmpeg.  
- Sanitize filenames for storage keys.

---

## 13. Research Notes (Phase 1)

### Filters verified (ffmpeg 7.x + libsoxr)

- `loudnorm` — EBU R128; `print_format=json`; measured_* params; `linear`  
- `silencedetect` — noise + duration  
- `volumedetect` — mean/max volume  
- `afade` — curves: tri, exp, log, qsin, …  
- `atempo` — tempo without pitch (0.5–100 chained)  
- `aresample` — with `resampler=soxr` when built `--enable-libsoxr`  
- Waveform: no dedicated audiowaveform audio→JSON filter in stock ffmpeg; use PCM pipe + JS  

### Codecs

- Lossy: MP3 (LAME), AAC (native), Vorbis, Opus  
- Lossless: FLAC, WAV/PCM, AIFF  
- Metadata: ID3v2 (MP3), Vorbis comments (FLAC/OGG), Opus tags, MP4 atoms (M4A)

### Why two-pass loudnorm

Single-pass uses dynamic compression within a limited measurement window. Two-pass measures whole-file integrated loudness then applies linear gain + true-peak limiting — industry standard for music/podcast delivery.

---

## 14. Implementation Phases (reference)

1. Research + this document + Docker Compose — **committed first**  
2. NestJS scaffold + upload + entities  
3. FfmpegService + unit tests  
4. Transcode + normalize + Socket.IO  
5. Waveform + metadata + silence + trim  
6. Streaming Range delivery  
7. Edge-case integration tests  
8. Swagger + README + UI dashboard  

---

*Document version: 1.0 — Phase 1 research complete. No application code precedes this commit.*
