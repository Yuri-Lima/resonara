## [2.1.0] — 2026-07-12

### Added
- Optional **expressive** TTS tier (Chatterbox Turbo/full, MIT) with Expressive Pack download
- REM expression markup, auto-direction, casting, humanization micro-layer
- Blind evaluation lab + prosody metrics + CMOS gates
- Human-Voice Frontier deliverable dashboard section

# Changelog

All notable changes to Resonara are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-07-12

### Added

- **Kokoro** neural TTS engine adapter with download script and honest engine status.
- **Whisper / faster-whisper** STT service and synthesis **QA loop** (WER, thresholds, deliberate-break).
- **Forced alignment** and word-level timestamps / subtitles.
- **Audiobook library** with covers, bookmarks/resume, pagination.
- **Podcast feeds** (RSS with enclosures; local-only).
- **Cover art** generation and embedding helpers.
- **EPUB 3 Media Overlays** export packaged as a valid `.epub` zip.
- **Text preprocessor** for document imports (page numbers, headers, footnotes, URLs).
- **CLI** (`scripts/resonara-cli.js`): synth, voices, engines, jobs, watch.
- **Watch-folder** daemon with write debounce and marker files.
- Full **pt-BR** pipeline: Piper faber voice, formatters, travessão dialogue parsing.
- Desktop packaging paths for Piper models (en + pt-BR) and optional Kokoro/Whisper tools.
- Typed **AppError** taxonomy, diagnostics bundle, crash-resume marking of interrupted jobs.
- Voice tool **library-first IA**, synthesis wizard, onboarding, keyboard map, settings, toasts.
- Feature-truth audit (`FEATURE_TRUTH.md`) and v2 release dashboard (`ui/deliverable/`).

### Changed

- Engine auto-selection is **language-aware** (Kokoro skipped for pt-BR).
- `/tts/engines` lists only languages that have voices (no empty pt-BR under Kokoro).
- Major version bump: feature wave after v1.0.0 is the new product surface.

### Fixed

- Unreachable Kokoro path in historical `resolveEngine` (pre-audit); runtime-proven in v2 probes.
- EPUB export now produces a structurally valid container (mimetype + META-INF + OEBPS).
- Preprocessor strips `Page N of M` PDF footers.
- CLI `--no-start` / `RESONARA_NO_AUTOSTART` for honest server-down handling.

### Security

- Diagnostics stay **local**; secrets redacted; no telemetry.

## [1.0.0] — 2026-06

### Added

- Initial Resonara desktop audio lab, piano, platform TTS long-form, FFmpeg pipeline.

[2.0.0]: https://github.com/Yuri-Lima/resonara/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Yuri-Lima/resonara/releases/tag/v1.0.0
