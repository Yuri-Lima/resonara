# Resonara

**Shape sound. Speak the long form. Play freely.**

Offline-first desktop audio studio — production tools, a hybrid piano, and long-form neural TTS that runs entirely on your machine.

[![Website](https://img.shields.io/badge/website-yuri--lima.github.io%2Fresonara-0d9488?style=for-the-badge&logo=github)](https://yuri-lima.github.io/resonara/)
[![License: MIT](https://img.shields.io/badge/License-MIT-334155?style=for-the-badge)](./LICENSE)
[![Platform](https://img.shields.io/badge/macOS%20%7C%20Windows-1e293b?style=for-the-badge&logo=apple&logoColor=white)](#install)
[![Stack](https://img.shields.io/badge/Electron%20·%20NestJS%20·%20ffmpeg-0f172a?style=for-the-badge)](#architecture)

| | |
|:--|:--|
| **Product** | [yuri-lima.github.io/resonara](https://yuri-lima.github.io/resonara/) |
| **Get started** | [Install guide](https://yuri-lima.github.io/resonara/get-started.html) |
| **Releases** | [GitHub Releases](https://github.com/Yuri-Lima/resonara/releases) |
| **API docs** | `/docs` when the engine is running |
| **License** | [MIT](./LICENSE) |

---


## Prosody & pauses

Resonara treats pauses as a **measured contract**, not taste. Three profiles
(`audiobook`, `podcast`, `news`) drive boundary-typed gaps (comma, sentence,
paragraph, header, chapter, pt-BR travessão). Piper gets `--sentence_silence`,
assembly inserts profile silence only at non-forced joins, and
`npm run probe:all` regression-guards conformance ≥ 90%. See
[PAUSE_TUNING.md](./PAUSE_TUNING.md) and [PAUSE_ARCHITECTURE.md](./PAUSE_ARCHITECTURE.md).

## Why Resonara

Most “AI audio” tools push speech and processing to the cloud. Resonara keeps the full loop local: import and normalize audio, play and record piano, synthesize long-form speech with offline neural engines, verify quality with Whisper, and ship chaptered files — without an account, API key, or always-on network.

| Studio | Capabilities |
|--------|----------------|
| **Audio Lab** | Import · transcode · two-pass EBU R128 loudnorm · trim · silence detect · waveform · stream & export |
| **Hybrid Piano** | Sample-pack piano · take recording · analyze & export into the same job model |
| **Voice** | Long-form TTS with **Kokoro**, **Piper**, optional **expressive** (Chatterbox), and platform voices · **English + pt-BR** · document import · read-along · library · CLI |

End users install a normal **macOS** or **Windows** app. No Docker, no Node, no terminal required.

---

## Features

### Audio production
- Two-pass **EBU R128** loudness normalization (not single-pass)
- Transcode, trim, silence detection, waveform peaks, HTTP Range streaming
- ffmpeg path resolution for GUI apps that strip `PATH`

### Voice / long-form TTS
- **Engines** behind one interface: **Kokoro-82M** · **Piper** · optional **expressive** (Chatterbox) · platform (`say` / SAPI)
- Language-aware routing: English prefers Kokoro when available; **pt-BR never falls back to English Kokoro**
- SSML subset, pronunciation dictionary, dialogue multi-speaker, seamless chunk concat
- Document import: EPUB, PDF, DOCX, Markdown, plain text with configurable preprocessing
- **Synthesis QA**: offline **faster-whisper** round-trip **WER** per chunk (`sample` / `full`) with one auto-retry
- **Read-along**: forced alignment, karaoke UI, EPUB 3 Media Overlays export
- **Library**: bookshelf, resume, bookmarks, sleep timer, 0.5×–3.0× pitch-preserving speed
- Cover art + metadata embed; optional LAN **podcast RSS** (`RESONARA_FEEDS=1`)
- Real **CLI** + watch-folder automation

### Multilingual (en · pt-BR)
- Auto language detection and mixed-language documents
- Portuguese number, date, currency, and ID expansion
- Bundled offline voices: `en_US-lessac-medium` · `pt_BR-faber-medium`

### Product
- Dual mode: **lite** (desktop, zero Docker) and **full** (Postgres · Redis · MinIO)
- Live job progress over Socket.IO
- Health checks for ffmpeg and TTS engines

Competitive research and roadmap: [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) · [IMPROVEMENT_ROADMAP.md](./IMPROVEMENT_ROADMAP.md) · [reports/INDEX.md](./reports/INDEX.md)

---

## Install

**Current release:** [v2.1.0](https://github.com/Yuri-Lima/resonara/releases/tag/v2.1.0) — expressive TTS tier + macOS / Windows installers.

| Platform | Asset | Direct download |
|----------|--------|-----------------|
| **macOS** (Apple Silicon) | `Resonara-2.1.0-arm64.dmg` | [DMG](https://github.com/Yuri-Lima/resonara/releases/download/v2.1.0/Resonara-2.1.0-arm64.dmg) |
| **macOS** (portable) | `Resonara-2.1.0-arm64-mac.zip` | [ZIP](https://github.com/Yuri-Lima/resonara/releases/download/v2.1.0/Resonara-2.1.0-arm64-mac.zip) |
| **Windows** x64 | `Resonara Setup 2.1.0.exe` | [NSIS Setup](https://github.com/Yuri-Lima/resonara/releases/download/v2.1.0/Resonara.Setup.2.1.0.exe) |
| All assets | GitHub Releases | [v2.1.0](https://github.com/Yuri-Lima/resonara/releases/tag/v2.1.0) · [latest](https://github.com/Yuri-Lima/resonara/releases/latest) |

### macOS

1. Download **`Resonara-2.1.0-arm64.dmg`** from the table above (or [Releases](https://github.com/Yuri-Lima/resonara/releases/tag/v2.1.0))  
   *(or build with `npm run dist:mac` → `release/Resonara-2.1.0-arm64.dmg`)*
2. Open the disk image and drag **Resonara** into **Applications**
3. Launch from Applications  
   - Unsigned builds: right-click → **Open** on first launch
4. The app starts a local engine and opens the studio UI

**Requirements:** macOS 12+ · Apple Silicon (arm64 DMG; Intel via local electron-builder if needed)

### Windows

1. Download **`Resonara Setup 2.1.0.exe`** (NSIS) from the table above  
   *(or build with `npm run dist:win` → `release/Resonara Setup 2.1.0.exe`)*
2. Run the installer
3. Launch from the Start Menu or desktop shortcut

**Requirements:** Windows 10 / 11 · x64

### Optional expressive pack (v2.1+)

Neural **expressive** voices (Chatterbox) are **not** in the base installer. After install:

```bash
npm run download:expressive   # optional multi-GB pack → ~/.resonara/expressive-pack
```

Or use Settings → models when available. Piper + Kokoro remain the default offline path.

### Host dependencies

| Dependency | Purpose |
|------------|---------|
| **[ffmpeg](https://ffmpeg.org/)** on `PATH` | Transcode, loudnorm, waveform, TTS concat |
| **System voices** (optional) | Platform TTS fallback when neural engines are offline |

```bash
# macOS
brew install ffmpeg

# Windows
winget install Gyan.FFmpeg
# or: choco install ffmpeg
```

Resonara also probes common install locations (`/opt/homebrew/bin`, `/usr/local/bin`, typical Windows ffmpeg folders) when the GUI environment has a minimal `PATH`.

---

## Quick start (developers)

```bash
git clone https://github.com/Yuri-Lima/resonara.git
cd resonara
npm install
npm run build

# Desktop app (recommended) — Electron + lite API on :3847
npm run desktop:dev

# Or API-only lite mode
RESONARA_LITE=1 PORT=3000 npm run start:lite
```

| Surface | URL |
|---------|-----|
| Audio Lab | http://127.0.0.1:3000/ui/ |
| Piano | http://127.0.0.1:3000/ui/piano/ |
| Voice | http://127.0.0.1:3000/ui/voice/ |
| Deliverable dashboard | http://127.0.0.1:3000/ui/deliverable/ |
| OpenAPI | http://127.0.0.1:3000/docs |

```bash
make ui          # open the competitive-parity / multilingual dashboard
npm test         # unit suite
npm run test:e2e # multilingual + lite e2e (when configured)
```

### Neural models (optional, offline)

```bash
npm run download:piper       # Piper binary/venv + en + pt-BR voices
npm run download:kokoro      # Kokoro ONNX + voices
npm run download:whisper     # faster-whisper venv + tiny/base (QA & alignment)
npm run download:expressive  # optional Chatterbox pack (v2.1+, multi-GB)
```

Models are gitignored and cached under `tools/` / `resources/` / `~/.resonara/`. Re-running download scripts is idempotent.

### Full stack (server mode)

```bash
cp .env.example .env
docker compose up -d postgres redis minio minio-init
npm install && npm run build
npm run start:dev    # API :3000 + workers as needed
```

---

## Voice engines

| Engine | Role | Notes |
|--------|------|--------|
| **Kokoro-82M** | Default for English when available | High naturalness, CPU ONNX, ~real-time |
| **Piper** | Default for pt-BR; strong EN fallback | Offline ONNX, packaged with installers |
| **Expressive** (optional) | Directed / dramatic long-form (v2.1+) | Chatterbox Turbo/full via `npm run download:expressive` |
| **Platform** | Last-resort fallback | macOS `say` / Windows SAPI — language-safe selection |

Auto selection is **language-aware**: Portuguese jobs never route to English-only Kokoro voices.

### Demos & QA

```bash
# English
npm run demo:quick
npm run demo:all
npm run demo:compare      # side-by-side engines (when available)

# Portuguese
npm run demo:pt:rapida
npm run demo:pt:numeros
npm run demo:pt:misturado
npm run demo:all-languages

# Synthesis quality (requires Whisper models)
npm run qa:sample         # one sample, full WER
npm run qa:all            # suite + demo-output/qa-report.{json,md}
npm run benchmark
```

---

## CLI & automation

```bash
npm run cli -- --help

# Synthesize a file
npm run cli -- synth path/to/chapter.txt --engine piper --out ./out --qa sample

# Inspect
npm run cli -- engines
npm run cli -- voices --language pt-BR
npm run cli -- jobs

# Watch folder — drop .txt / .md / .epub / .docx
npm run cli -- watch ./inbox --out ./out --engine auto
```

The CLI boots a lite server if none is running, polls job progress, and writes audio (plus `.done` / `.failed` markers in watch mode).

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Resonara Desktop (Electron)                             │
│  Shell · preload · spawns local lite API as Node         │
└────────────────────────────┬─────────────────────────────┘
                             │  http://127.0.0.1:<port>
┌────────────────────────────▼─────────────────────────────┐
│  NestJS engine                                           │
│  Tracks · Piano · TTS · STT · Library · Feeds · Health   │
│  Socket.IO job progress · fluent-ffmpeg                  │
├──────────────── lite ─────────────────┬── full ──────────┤
│  sql.js · filesystem · inline jobs    │  Postgres        │
│  Zero Docker for end users            │  Redis / BullMQ  │
│                                       │  MinIO           │
└───────────────────────────────────────┴──────────────────┘
```

| Mode | When | Storage | Queue |
|------|------|---------|-------|
| **Lite** | `RESONARA_LITE=1` / desktop | Filesystem + sql.js | Inline runner |
| **Full** | Server / Compose | MinIO + Postgres | BullMQ + Redis |

Deep dives: [AUDIO_ARCHITECTURE.md](./AUDIO_ARCHITECTURE.md) · [PIANO_ARCHITECTURE.md](./PIANO_ARCHITECTURE.md)

---

## API overview

OpenAPI UI: **`/docs`**.

### Health

```http
GET /health
```

Product metadata, mode (`lite` | `full`), and checks for database, ffmpeg, and TTS.

### Voice (selected)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tts/voices` | Unified voice list (`?language=pt-BR`) |
| `GET` | `/tts/engines` | Kokoro / Piper / platform availability |
| `POST` | `/tts/synthesize` | Long-form job (`text`, `engine`, `language`, `qa`, …) |
| `POST` | `/tts/detect-language` | en / pt-BR detection |
| `POST` | `/tts/import` | Multipart document → chapters → synthesize |
| `POST` | `/tts/preprocess-preview` | Show preprocessing removals before synth |
| `GET` | `/tts/jobs` · `/tts/jobs/:id` | Job list & detail |
| `GET` | `/tts/jobs/:id/download` | Audio / chapter / EPUB3-MO export |
| `GET` | `/tts/jobs/:id/qa` | Per-chunk WER table |
| `GET` | `/tts/library` | Bookshelf aggregation |
| `GET` | `/feeds/:jobId/rss.xml` | Podcast RSS (when feeds enabled) |
| `POST` | `/stt/transcribe` | Offline Whisper transcription |

### Audio Lab (selected)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tracks/upload` | Upload with magic-byte validation |
| `POST` | `/tracks/:id/transcode` | Format conversion job |
| `POST` | `/tracks/:id/normalize` | Two-pass EBU R128 |
| `GET` | `/tracks/:id/waveform` | Peaks + RMS |
| `GET` | `/tracks/:id/stream` | HTTP Range / 206 |
| `WS` | `/jobs` | `subscribe` → progress events |

### Piano

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/piano/packs` | Sample packs |
| `POST` | `/piano/takes` | Create take |
| `POST` | `/piano/takes/:id/export` | Export take |

---

## Packaging

```bash
npm run dist:mac    # → release/*.dmg , *.zip
npm run dist:win    # → release/*Setup*.exe (NSIS)
npm run dist:all    # mac + win targets
npm run pack        # unpacked directory (debug)
```

| Target | Artifact | Notes |
|--------|----------|--------|
| macOS | DMG + ZIP | arm64 / x64 via electron-builder |
| Windows | NSIS | Start Menu + desktop shortcuts |

Config: `package.json` → `"build"` (`appId`: `app.resonara.desktop`).  
Packaged builds run the Nest engine with **`ELECTRON_RUN_AS_NODE`** so end users do not install Node.js.  
Windows checklist: [WINDOWS_TESTING.md](./WINDOWS_TESTING.md).

---

## Project layout

```
resonara/
├── desktop/              # Electron main + preload
├── src/
│   ├── ffmpeg/           # Processing + path resolution
│   ├── tracks/           # Audio Lab API
│   ├── piano/            # Sample piano + takes
│   ├── tts/              # Engines, chunker, QA, library, feeds, export
│   ├── stt/              # Offline Whisper service
│   ├── jobs/ · queue/    # Workers + inline runner
│   ├── storage/          # MinIO or filesystem (lite)
│   └── health/           # /health
├── ui/                   # Lab · piano · voice · deliverable dashboard
├── scripts/              # CLI, demos, model downloads, smoke tests
├── samples/              # Demo texts + piano pack seeds
├── tools/                # Local venvs & models (gitignored binaries)
├── reports/              # Phase evidence & audits
└── docs/                 # Marketing / product site sources
```

---

## Scripts reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile Nest → `dist/` |
| `npm run desktop:dev` | Electron + lite API |
| `npm run start:lite` | Lite API only |
| `npm run start:dev` | Full Nest watch mode |
| `npm test` / `test:cov` / `test:e2e` | Unit, coverage, e2e |
| `npm run cli` | Resonara CLI |
| `npm run qa:sample` / `qa:all` | WER QA runners |
| `npm run demo:*` / `demo:pt:*` | Synthesis demos |
| `npm run download:piper` / `kokoro` / `whisper` | Offline model setup |
| `npm run dist:mac` / `dist:win` | Installers |
| `npm run smoke:tts` / `smoke:service` | Live smoke checks |
| `make ui` | Open deliverable dashboard |

---

## Documentation

| Document | Topic |
|----------|--------|
| [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) | Landscape vs ebook2audiobook, Storyteller, Audiobookshelf, Kokoro, Whisper |
| [IMPROVEMENT_ROADMAP.md](./IMPROVEMENT_ROADMAP.md) | Pillars A–F and phase map |
| [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md) | Earlier TTS improvement plan |
| [MULTILINGUAL_PLAN.md](./MULTILINGUAL_PLAN.md) | en / pt-BR design |
| [AUDIO_ARCHITECTURE.md](./AUDIO_ARCHITECTURE.md) | Lab pipeline |
| [PIANO_ARCHITECTURE.md](./PIANO_ARCHITECTURE.md) | Piano module |
| [reports/INDEX.md](./reports/INDEX.md) | Session / phase evidence index |
| [WINDOWS_TESTING.md](./WINDOWS_TESTING.md) | Windows packaging verification |

---

## Security notes

- **Podcast feeds** (`RESONARA_FEEDS`) are unauthenticated by design for LAN podcast apps. Keep them off on public interfaces; bind to localhost or a trusted network when enabled.
- Desktop lite binds the API to **localhost** by default.
- No cloud TTS/STT is required for core features; model downloads are explicit opt-in.

---

## Known limits (v1)

- Installers ship **unsigned** unless you add Apple notarization / Authenticode certificates  
- **ffmpeg** is not bundled — must be available on the host  
- No Linux desktop installer in v1  
- Voice cloning and OCR are **out of scope** (CPU offline-first product constraints)  
- Not a multi-tenant cloud SaaS; lite desktop is the default path  

---

## Contributing

1. Fork and clone the repository  
2. `npm install && npm run build`  
3. Prefer lite mode (`npm run desktop:dev`) for UI and API work  
4. Add or extend unit tests beside the module you change  
5. Open a PR with behavior notes and how you verified (tests, demos, QA)

---

## License

[MIT](./LICENSE) © Resonara contributors

---

<p align="center">
  <strong>Resonara</strong><br/>
  <em>Shape sound. Speak the long form. Play freely.</em><br/>
  <a href="https://yuri-lima.github.io/resonara/">Product site</a>
  ·
  <a href="https://github.com/Yuri-Lima/resonara/releases">Releases</a>
  ·
  <a href="./LICENSE">MIT License</a>
</p>
