# Resonara

**Shape sound. Speak the long form. Play freely.**

Resonara is a cross-platform **desktop audio studio** for macOS and Windows:

| Area | What you get |
|------|----------------|
| **Audio lab** | Import → transcode, two-pass EBU R128 loudnorm, trim, silence detect, waveform, stream/export |
| **Piano** | Hybrid sample piano, record takes, export |
| **Voice** | Offline **system TTS** for long documents (10k+ words): chunk → synthesize → concat |

End users install a normal app — **no Docker, Node, or terminal** required for the desktop build.

---

## Install (desktop)

### macOS
1. Download the latest **Resonara** `.dmg` from [Releases](../../releases) (or build with `npm run dist:mac`).
2. Open the DMG and drag **Resonara** to Applications.
3. Launch **Resonara** from Applications (first launch may require right-click → Open if unsigned).
4. The app starts a local engine and opens the UI automatically.

**Supported:** macOS 12+ on Apple Silicon and Intel (universal/zip targets via electron-builder).

### Windows
1. Download the **Resonara Setup** `.exe` (NSIS) from Releases (or build with `npm run dist:win` on a Windows machine / CI).
2. Run the installer; choose install directory if prompted.
3. Launch **Resonara** from the Start Menu or desktop shortcut.

**Supported:** Windows 10/11 x64.

### Known limits (v1)
- Builds ship **unsigned** (no Apple notarization / Authenticode) unless you add your own certificates.
- System TTS uses **macOS `say`** / **Windows System.Speech** — quality and languages depend on OS voices installed.
- Full multi-user cloud SaaS is out of scope; desktop mode is offline-first (**lite**: sql.js + filesystem + inline jobs).
- Linux installer is not provided in v1.
- **ffmpeg** must be on PATH (the app does not yet ship a static ffmpeg binary). Install via Homebrew (`brew install ffmpeg`) or the Windows ffmpeg build.
- Packaged app runs the local API via **Electron as Node** (`ELECTRON_RUN_AS_NODE`) — end users do **not** install Node.js or Docker.

---

## Developer quick start

### Desktop (lite, no Docker)

```bash
npm install
npm run build
npm run desktop:dev    # Electron + local lite API on :3847
# or API only:
RESONARA_LITE=1 PORT=3000 npm run start:lite
```

Open `http://127.0.0.1:3000/ui/` (lab), `/ui/piano/`, `/ui/voice/`.

### Full stack (Docker: Postgres, Redis, MinIO)

```bash
cp .env.example .env   # if present
docker compose up -d postgres redis minio minio-init
npm install
npm run build
npm run start:dev      # API :3000 — Swagger /docs
```

---

## Packaging installers

```bash
npm run dist:mac    # → release/*.dmg , *.zip
npm run dist:win    # → release/*Setup*.exe (NSIS) — run on Windows or wine/CI
npm run dist:all    # mac + win targets from electron-builder config
```

Configuration lives in `package.json` → `"build"` (electron-builder):

- **mac:** `dmg` + `zip` for `arm64` and `x64`
- **win:** `nsis` x64 with Start Menu + desktop shortcuts

Artifacts are written to `release/`.

---

## System TTS API

```http
GET  /tts/voices
GET  /tts/engine
POST /tts/synthesize   { "text": "...", "voice": "Samantha", "format": "wav" }
GET  /tts/jobs/:id
GET  /tts/jobs/:id/download
```

Long text is chunked at paragraph/sentence boundaries, synthesized per platform, concatenated with ffmpeg. Progress: job polling + Socket.IO `job:progress` on namespace `/jobs`.

Health (includes ffmpeg + TTS):

```http
GET /health
```

---

## Audio lab API (summary)

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
| GET | `/jobs/:id` | Progress / result |
| WS | `/jobs` | `subscribe` → `job:progress` |

Architecture: **[AUDIO_ARCHITECTURE.md](./AUDIO_ARCHITECTURE.md)** · Piano: **[PIANO_ARCHITECTURE.md](./PIANO_ARCHITECTURE.md)**

---

## Tests & smoke

```bash
npm test                 # unit (chunker, platform TTS builders, ffmpeg, …)
npm run smoke:tts        # real macOS say chunk→concat when on Darwin
npm run smoke:service    # boot lite API, health + UI surfaces
```

---

## License

MIT
