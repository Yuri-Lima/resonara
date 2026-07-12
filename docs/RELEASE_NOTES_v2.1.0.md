# Resonara 2.1.0 — Release Notes

**Ship date:** 2026-07-12  
**Theme:** Human-Voice Frontier — optional expressive TTS on the proven v2 desktop.

## Why 2.1

v2.0 delivered competitive offline parity (Kokoro, Piper, Whisper QA, library, pt-BR).  
v2.1 adds an **optional expressive tier** (Chatterbox Turbo/full, MIT), expression markup (REM), auto-direction, humanization, and a frontier evaluation dashboard — without bloating the base installer.

## Downloads

| Platform | File | URL |
|----------|------|-----|
| macOS Apple Silicon | `Resonara-2.1.0-arm64.dmg` | https://github.com/Yuri-Lima/resonara/releases/download/v2.1.0/Resonara-2.1.0-arm64.dmg |
| macOS portable | `Resonara-2.1.0-arm64-mac.zip` | https://github.com/Yuri-Lima/resonara/releases/download/v2.1.0/Resonara-2.1.0-arm64-mac.zip |
| Windows x64 | `Resonara Setup 2.1.0.exe` | https://github.com/Yuri-Lima/resonara/releases/download/v2.1.0/Resonara.Setup.2.1.0.exe |
| Release page | all assets | https://github.com/Yuri-Lima/resonara/releases/tag/v2.1.0 |

Build locally:

```bash
npm run dist:mac   # → release/Resonara-2.1.0-arm64.dmg (+ zip)
npm run dist:win   # → release/Resonara Setup 2.1.0.exe
npm run dist:all
```

## Highlights

1. **Optional expressive TTS** — Chatterbox Turbo/full behind the same Voice UI; Expressive Pack via `npm run download:expressive`.
2. **REM + direction** — expression markup, auto-direction, casting, humanization micro-layer.
3. **Eval lab** — blind **human** CMOS sessions (only Gate 2 certifier). Automated prosody proxy is diagnostic only; Gate 2 is NOT CERTIFIED until a human ledger exists.
4. **Frontier dashboard** — `/ui/deliverable/` Human-Voice Frontier section.
5. **Same desktop shell** — macOS DMG + Windows NSIS still bundle Piper en + pt-BR; Kokoro/Whisper/expressive remain on-demand.

## Upgrade from 2.0

- Install 2.1 over 2.0. Your `~/.resonara` data directory is reused.
- Base install path unchanged: Piper models ship in the installer.
- For expressive synthesis, run `npm run download:expressive` (or Settings when wired) after install.

## Installer notes

- **macOS DMG:** app + Piper models (en_US-lessac, pt_BR-faber). Unsigned: right-click → Open on first launch.
- **Windows NSIS:** x64; SmartScreen may warn on unsigned builds (More info → Run anyway).
- **ffmpeg** still required on host `PATH` (not bundled).
- Expressive weights are **not** in the DMG/NSIS size budget.

## Privacy

Still offline-first. No cloud TTS. No analytics. Diagnostics never leave your machine unless you send the zip.

## See also

- [CHANGELOG.md](../CHANGELOG.md)
- [FEATURE_TRUTH.md](../FEATURE_TRUTH.md) (v2.0 feature audit)
- [ENGINE_DECISION.md](../ENGINE_DECISION.md) (expressive winner)
- [RELEASE_NOTES_v2.0.0.md](./RELEASE_NOTES_v2.0.0.md)
