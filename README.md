# Resonara

**Shape sound. Speak the long form. Play freely.**

[![Website](https://img.shields.io/badge/website-yuri--lima.github.io%2Fresonara-2dd4bf?style=flat-square)](https://yuri-lima.github.io/resonara/)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f766e?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-1e293b?style=flat-square)](#install)
[![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20NestJS%20%7C%20ffmpeg-334155?style=flat-square)](#architecture)
[![Mode](https://img.shields.io/badge/desktop-offline%20lite-0ea5e9?style=flat-square)](#desktop-lite-mode)

**Site:** [yuri-lima.github.io/resonara](https://yuri-lima.github.io/resonara/) · **Docs:** [Get started](https://yuri-lima.github.io/resonara/get-started.html)

Resonara is a cross-platform **desktop audio studio** for creators, producers, and anyone who needs local control over sound and speech. One installable app unifies:

| Studio | What you can do |
|--------|------------------|
| **Audio lab** | Import, transcode, two-pass EBU R128 loudnorm, trim, silence detect, waveform, stream & export |
| **Piano** | Play a hybrid sample piano, record takes, analyze and export |
| **Voice** | Offline multi-engine TTS (**Kokoro** + **Piper** + platform): **English + Brazilian Portuguese (pt-BR)**, Whisper WER QA, forced-alignment read-along, library/bookmarks, podcast RSS, CLI/watch, SSML, document import, chaptered export |

End users get a normal **macOS** or **Windows** installer — no Docker, no Node, no terminal setup.

---

## Highlights

- **Offline-first desktop** — local engine, filesystem storage, no cloud account required for core flows  
- **Production audio path** — two-pass loudnorm (not single-pass), soxr-aware processing via ffmpeg  
- **Long-form speech** — **Kokoro-82M** + **Piper** neural voices (offline ONNX, **en + pt-BR**) with **macOS `say` / Windows SAPI** fallback; SSML, dictionary, EPUB/PDF/DOCX/MD import, chaptered jobs  
- **Synthesis QA** — offline **faster-whisper** round-trip WER per chunk (sample/full) with auto-retry — catches silent drops listening alone misses  
- **Read-along** — forced alignment → word timestamps, karaoke UI, EPUB 3 Media Overlays export  
- **Library & distribution** — bookshelf UI, resume/bookmarks/sleep/speed, deterministic covers, optional LAN podcast RSS (`RESONARA_FEEDS=1`)  
- **Automation** — real CLI (`npm run cli`) with `synth` / `voices` / `engines` / `jobs` / `watch`  
- **Multilingual TTS** — auto language detection, Portuguese number/date/currency expansion, mixed-language documents, never cross-language voice fallback  
- **Competitive positioning** — see [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) and [IMPROVEMENT_ROADMAP.md](./IMPROVEMENT_ROADMAP.md); phase evidence in [reports/INDEX.md](./reports/INDEX.md)  
- **Hybrid piano** — sample-pack playback, take capture, and export wired into the same job model  
- **Live job progress** — normalize, export, and TTS report progress without freezing the UI  
- **Health checks** — first-run / on-demand status for **ffmpeg** and **TTS** engines (with path resolution for GUI apps)

---

## Install

### macOS

1. Download the latest **Resonara** `.dmg` from [Releases](https://github.com/Yuri-Lima/resonara/releases)  
   *(or build locally with `npm run dist:mac`)*  
2. Open the disk image and drag **Resonara** into **Applications**  
3. Launch from Applications  
   - First launch of an unsigned build: right-click → **Open**  
4. The app starts a local engine and opens the studio UI  

**Supported:** macOS 12+ · Apple Silicon and Intel targets via electron-builder  

### Windows

1. Download the **Resonara Setup** `.exe` (NSIS) from [Releases](https://github.com/Yuri-Lima/resonara/releases)  
   *(or build on Windows/CI with `npm run dist:win`)*  
2. Run the installer (optional custom install directory)  
3. Launch from the Start Menu or desktop shortcut  

**Supported:** Windows 10 / 11 · x64  

### Prerequisites (host)

| Dependency | Why |
|------------|-----|
| **[ffmpeg](https://ffmpeg.org/)** on `PATH` | Transcode, loudnorm, waveform, TTS concat |
| **System voices** | macOS Speech / Windows SAPI voices for TTS |

```bash
# macOS
brew install ffmpeg

# Windows (example)
winget install Gyan.FFmpeg
# or chocolatey: choco install ffmpeg
```

Resonara resolves common install locations (`/opt/homebrew/bin`, `/usr/local/bin`, Windows ffmpeg folders) when GUI apps strip `PATH`.

---



## Voice / TTS

Primary engine is **Piper** (offline neural). Platform voices remain as automatic fallback.

```bash
# Optional: download Piper binary + default English voice
npm run download:piper
export PIPER_PATH=./resources/piper/piper
export PIPER_MODELS_DIR=./resources/piper/models
```

| Endpoint | Description |
|----------|-------------|
| `GET /tts/voices` | Unified Piper + platform voices (`?language=pt-BR`) |
| `GET /tts/engines` | Engine availability |
| `POST /tts/synthesize` | Long-form job (`language`, `engine`, `ssml`, post-process) |
| `POST /tts/detect-language` | Paragraph-level en / pt-BR detection |
| `POST /tts/import` | Multipart document → chapters → synthesize |
| `GET /tts/jobs` | Paginated persisted jobs |
| `GET /tts/jobs/:id/chapters` | Chapter timestamps |
| `GET/POST /tts/dictionary` | Pronunciation CRUD (per-language entries) |
| `GET /tts/ssml` | Supported SSML subset |

See [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md), [MULTILINGUAL_PLAN.md](./MULTILINGUAL_PLAN.md), and [G25_AUDIT_REPORT.md](./G25_AUDIT_REPORT.md).
Dashboard: `ui/deliverable/` (`make ui`). Windows runtime checklist: [WINDOWS_TESTING.md](./WINDOWS_TESTING.md).

### Multilingual demos

```bash
npm run download:piper     # en_US-lessac-medium + pt_BR-faber-medium
npm run demo:quick         # English smoke
npm run demo:pt:rapida     # Portuguese smoke
npm run demo:pt:numeros    # R$, dates, CPF expansion
npm run demo:pt:misturado  # Mixed en+pt-BR document
npm run demo:all-languages # Full bilingual suite
npm run benchmark:pt
```

Bundled offline voices: **en_US-lessac-medium** · **pt_BR-faber-medium**. Platform fallbacks stay language-safe (e.g. macOS Luciana for pt-BR — never English for Portuguese text).

## Screenshots & UI surfaces

| Surface | URL (local) | Purpose |
|---------|-------------|---------|
| Audio lab | `/ui/` | Pipeline dashboard, codecs, loudness, jobs |
| Piano | `/ui/piano/` | Sample piano + takes |
| Voice | `/ui/voice/` | Long-form TTS paste → speak → download |

Swagger (API mode): `/docs`

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Resonara Desktop (Electron)                            │
│  · Shell + preload                                      │
│  · Spawns local lite API (Electron as Node)             │
└───────────────────────────┬─────────────────────────────┘
                            │  http://127.0.0.1:<port>
┌───────────────────────────▼─────────────────────────────┐
│  NestJS engine                                          │
│  · Tracks / jobs / piano / TTS / health                 │
│  · Socket.IO job progress                               │
│  · fluent-ffmpeg                                        │
├──────────────── lite ────────────────┬── full ──────────┤
│  sql.js · filesystem · inline jobs   │  Postgres        │
│  (no Docker for end users)           │  Redis / BullMQ  │
│                                      │  MinIO           │
└──────────────────────────────────────┴──────────────────┘
```

### Desktop lite mode

When `RESONARA_LITE=1` / `RESONARA_DESKTOP=1`:

- **Database:** sql.js (portable column types)  
- **Storage:** local filesystem under the app data directory  
- **Queue:** inline `JobRunnerService` (no Redis)  
- **TTS:** platform adapters + ffmpeg concat  

Full stack (Docker Compose) remains available for server-style deployments.

Deep dives: [AUDIO_ARCHITECTURE.md](./AUDIO_ARCHITECTURE.md) · [PIANO_ARCHITECTURE.md](./PIANO_ARCHITECTURE.md)

---

## Developer quick start

### Requirements

- Node.js 20+  
- npm  
- ffmpeg / ffprobe on `PATH`  
- (Full stack only) Docker Compose  

### Desktop (recommended)

```bash
git clone https://github.com/Yuri-Lima/resonara.git
cd resonara
npm install
npm run build
npm run desktop:dev    # Electron + lite API on :3847
```

API-only lite mode:

```bash
RESONARA_LITE=1 PORT=3000 npm run start:lite
```

Then open:

- http://127.0.0.1:3000/ui/  
- http://127.0.0.1:3000/ui/piano/  
- http://127.0.0.1:3000/ui/voice/  
- http://127.0.0.1:3000/docs  

### Full stack (Postgres · Redis · MinIO)

```bash
cp .env.example .env   # if present
docker compose up -d postgres redis minio minio-init
npm install
npm run build
npm run start:dev      # API :3000
```

---

## Packaging

```bash
npm run dist:mac    # → release/*.dmg , *.zip
npm run dist:win    # → release/*Setup*.exe (NSIS) — Windows host or CI
npm run dist:all    # mac + win targets
npm run pack        # unpacked dir only (debug)
```

| Target | Format | Notes |
|--------|--------|--------|
| macOS | DMG + ZIP | arm64 / x64 via electron-builder |
| Windows | NSIS | Start Menu + desktop shortcuts |

Config: `package.json` → `"build"` (`appId`: `app.resonara.desktop`).  
Artifacts land in `release/` (gitignored).

Packaged builds run the Nest engine with **`ELECTRON_RUN_AS_NODE`** so end users do not install Node.js.

---

## API overview

### Health

```http
GET /health
```

Returns product metadata, mode (`lite` | `full`), checks for database / ffmpeg / TTS, and resolved ffmpeg paths.

### Voice (system TTS)

```http
GET  /tts/voices
GET  /tts/engine
POST /tts/synthesize
     { "text": "...", "voice": "Samantha", "format": "wav" }
GET  /tts/jobs/:id
GET  /tts/jobs/:id/download
```

Long text is split at paragraph/sentence boundaries, synthesized per platform, concatenated with ffmpeg. Progress via job polling and Socket.IO (`/jobs` → `job:progress`).

### Audio lab

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tracks/upload` | Upload with magic-byte validation |
| `POST` | `/tracks/:id/transcode` | Enqueue format conversion |
| `POST` | `/tracks/:id/normalize` | Two-pass EBU R128 loudnorm |
| `GET` | `/tracks/:id/waveform` | Peaks + RMS JSON |
| `GET` | `/tracks/:id/metadata` | ffprobe + tags |
| `GET` | `/tracks/:id/silence` | Silence regions |
| `POST` | `/tracks/:id/trim` | Trim + fade |
| `GET` | `/tracks/:id/stream` | HTTP Range / 206 |
| `GET` | `/jobs/:id` | Job status / result |
| `WS` | `/jobs` | `subscribe` → progress events |

### Piano

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/piano/packs` | List sample packs |
| `GET` | `/piano/packs/:id/samples/:note` | Sample URL |
| `POST` | `/piano/takes` | Create take |
| `POST` | `/piano/takes/:id/export` | Export take |

OpenAPI: `/docs` when the API is running.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile Nest to `dist/` |
| `npm run desktop:dev` | Build + Electron desktop (lite) |
| `npm run start:lite` | Lite API only |
| `npm run start:dev` | Full Nest watch mode |
| `npm test` | Unit tests (chunker, TTS adapters, ffmpeg, …) |
| `npm run smoke:tts` | Live Mac TTS chunk → concat smoke |
| `npm run smoke:service` | Boot lite API + UI surface checks |
| `npm run dist:mac` / `dist:win` | Installers |

---

## Project layout

```
resonara/
├── desktop/           # Electron main + preload
├── src/
│   ├── ffmpeg/        # Processing + path resolution
│   ├── tracks/        # Audio lab API
│   ├── jobs/          # Queue workers + inline runner
│   ├── piano/         # Sample piano + takes
│   ├── tts/           # Chunker, platform adapters, API
│   ├── storage/       # MinIO or filesystem (lite)
│   └── health/        # /health
├── ui/                # Audio lab, piano, voice UIs
├── samples/           # Seed upright sample pack
├── scripts/           # Smoke + helper scripts
└── package.json       # App + electron-builder config
```

---

## Known limits (v1)

- Installers ship **unsigned** (no Apple notarization / Authenticode) unless you add certificates  
- TTS quality and languages depend on **OS-installed voices**  
- **ffmpeg** is not bundled yet — must be on the host `PATH`  
- No Linux installer in v1  
- Not a multi-user cloud SaaS; desktop lite is the default offline path  

---

## Contributing

1. Fork and clone the repo  
2. `npm install && npm run build`  
3. Prefer lite mode (`npm run desktop:dev`) for UI/API work  
4. Add or extend unit tests next to the module you change  
5. Open a PR with a clear description of behavior and test notes  

---

## License

[MIT](./LICENSE) © Resonara contributors

---

<p align="center">
  <strong>Resonara</strong><br/>
  <em>Shape sound. Speak the long form. Play freely.</em>
</p>
