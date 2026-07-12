# Resonara 2.2.0 — Release Notes

**Ship date:** 2026-07-12  
**Theme:** TTS-only product — offline long-form text-to-speech.

## Why 2.2

v2.1 shipped the expressive tier and Gate 2 honesty work.  
v2.2 **narrows the product** to one job: turn text and documents into chaptered speech on your machine.

**Resonara is:** offline long-form TTS (multi-engine, en + pt-BR, documents → chaptered audio, optional quality gates).  
**Resonara is not:** audio lab, hybrid piano, podcast host, or music takes.

## Downloads

| Platform | File | URL |
|----------|------|-----|
| macOS Apple Silicon | `Resonara-2.2.0-arm64.dmg` | https://github.com/Yuri-Lima/resonara/releases/download/v2.2.0/Resonara-2.2.0-arm64.dmg |
| macOS portable | `Resonara-2.2.0-arm64-mac.zip` | https://github.com/Yuri-Lima/resonara/releases/download/v2.2.0/Resonara-2.2.0-arm64-mac.zip |
| Windows x64 | `Resonara Setup 2.2.0.exe` | https://github.com/Yuri-Lima/resonara/releases/download/v2.2.0/Resonara.Setup.2.2.0.exe |
| Release page | all assets | https://github.com/Yuri-Lima/resonara/releases/tag/v2.2.0 |

Build locally:

```bash
npm run dist:mac   # → release/Resonara-2.2.0-arm64.dmg (+ zip)
npm run dist:win   # → release/Resonara Setup 2.2.0.exe
```

## Highlights

1. **Voice is the app** — desktop and `/ui/` open the Voice tool; no Audio Lab or Piano shells.
2. **Engines unchanged** — Piper, Kokoro, optional expressive (Chatterbox), platform fallback; en + pt-BR.
3. **Documents → chaptered audio** — import, synthesize, library, download; optional Whisper QA gates.
4. **Removed** — Hybrid Piano, Audio Lab tracks/transcode/loudnorm UI+API, podcast RSS (`/feeds`).

## Upgrade from 2.1

- Install 2.2 over 2.1. Your `~/.resonara` (or app userData) TTS jobs are reused where paths match.
- Piano takes and track-lab assets are no longer in the product; TTS jobs remain the primary library.
- Base install still bundles Piper en + pt-BR; Kokoro / Whisper / expressive remain on-demand.

## Installer notes

- **macOS DMG:** unsigned — right-click → Open on first launch. Requires ffmpeg on `PATH`.
- **Windows NSIS:** x64; SmartScreen may warn on unsigned builds. Requires ffmpeg on `PATH`.
- Expressive weights are **not** in the installer size budget (`npm run download:expressive` when needed).

## Privacy

Still offline-first. No cloud TTS. No analytics. Diagnostics never leave your machine unless you send the zip.

## See also

- [CHANGELOG.md](../CHANGELOG.md)
- [RELEASE_NOTES_v2.1.0.md](./RELEASE_NOTES_v2.1.0.md)
