# Resonara 2.0 — Release Notes

**Ship date:** 2026-07-12  
**Theme:** Competitive parity, proven offline.

## Why 2.0

v1.0 spoke with platform voices. v2.0 is a full offline audiobook lab: neural engines, quality assurance, library, feeds, multilingual Portuguese, and desktop packaging that bundles the models you need.

We did not changelog our way into this release. Every major feature was **runtime-probed** (FEATURE_TRUTH.md). Features that were only half-wired were fixed or would have been descoped — none needed descope.

## Highlights

1. **Neural speech** — Piper (en + pt-BR) and Kokoro (en) with an engines panel that tells the truth.
2. **Quality loop** — Whisper listens back; WER gates catch broken chunks.
3. **Library-first** — Bookshelf with covers, continue-listening, resume positions.
4. **Portuguese (Brasil)** — Real faber voice, currency/date expansion, dialogue with travessão.
5. **Creator tools** — CLI, watch folder, podcast RSS, EPUB media overlays, cover art.
6. **Reliable desktop** — Typed errors, diagnostics zip (local only), crash-resume of interrupted jobs.

## Upgrade from 1.0

- Install 2.0 over 1.0. Your `~/.resonara` data directory is reused.
- Jobs interrupted mid-flight are marked failed with a clear retry message.
- Download any missing models from Settings or `node scripts/download-*.js`.

## Installer notes

- **macOS DMG:** includes app + Piper models (en_US-lessac, pt_BR-faber). Kokoro/Whisper download on demand or via scripts.
- **Windows NSIS:** build-verified; runtime smoke checklist documented (honest labeling when not run on this machine).

## Privacy

Still offline-first. No cloud TTS. No analytics. Diagnostics never leave your machine unless you send the zip.
