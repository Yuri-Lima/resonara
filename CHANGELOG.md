# Changelog

All notable changes to Resonara are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.0] — 2026-07-12

### Removed

- **Hybrid Piano** product surface (UI, API, sample packs, takes)
- **Audio Lab** product surface (track upload/transcode/loudnorm/trim/waveform UI + APIs)
- **Podcast RSS feeds** (`/feeds`, `RESONARA_FEEDS`)
- Transcode job queue / BullMQ audio workers tied only to Lab + Piano

### Changed

- Product focus: **offline long-form text-to-speech** only (multi-engine, en + pt-BR, documents → chaptered audio, optional QA)
- Desktop and `/ui/` open **Voice** as the primary surface
- Tagline and package description retargeted away from “audio studio / play freely”
- Product version **2.1.0 → 2.2.0** (package, OpenAPI, GitHub Pages download URLs)
- Installers: `Resonara-2.2.0-arm64.dmg` / zip · `Resonara Setup 2.2.0.exe`

## [2.1.0] — 2026-07-12

### Added

- Optional **expressive** TTS tier (Chatterbox Turbo/full, MIT) with Expressive Pack download
- REM expression markup, auto-direction, casting, humanization micro-layer
- Blind evaluation lab + prosody metrics; Gate 2 certifies only via **human** CMOS (eval-lab)
- Human-Voice Frontier deliverable dashboard section
- macOS / Windows installer targets for the expressive release (`Resonara-2.1.0-arm64.dmg`, `Resonara Setup 2.1.0.exe`)
- **Product-path direction runtime** (`direction-runtime.ts`): job `exaggeration`, REM per-segment controls, and `humanize` directed AF are applied at synth time (not scaffolding)
- Content→affect fallback for plain monologues (`contentAffectFromText`) when `humanize=true`
- Gate 2 product-path diagnostic harness (`npm run recert:gate2`) + objective prosody proxy artifacts (`bench/eval/gate2-product-path-*`; human CMOS NOT CERTIFIED)
- `blind-gate.js --expr-root` / `--tag` so product-path scoring does not clobber offline Gate 2 ledgers

### Changed

- Product version **2.0.0 → 2.1.0** (package, OpenAPI, GitHub Pages download fallbacks)
- Marketing/docs download URLs now point at **v2.1.0** macOS DMG/ZIP and Windows NSIS assets
- Expressive synth no longer hardcodes `exaggeration: 0.55` over the request/REM value
- REM compile keeps native tags for expressive; non-expressive still gets speakable-only text
- Frontier dashboard Gate 2 figure shows **NOT CERTIFIED** until a human panel ledger exists (prior automated PASS claims invalid)
- Automated proxy ledger fields use `meanProxyExpressiveVsPiper` / `proxyAb` only (no stale `*Cmos*` keys on the proxy path)
- `styleProfile: drama` maps to narrative affect (not animated/joy); emotion comes from content/REM

### Fixed

- **Gate 2 methodology:** automated circular F0-band “CMOS” scorer no longer certifies; status is `NOT_CERTIFIED_AWAITING_HUMAN_PANEL` until human eval-lab ledger exists. Offline directed-final “+1.0 PASS” and product-path “+0.75 PASS” quarantined as invalid.
- Dead `directedAudioFilter` / `emotionToAffect` — now invoked via `FfmpegService.applyAudioFilter` when `humanize=true`
- Gate 2 honesty: invalid automated PASS claims quarantined; human panel required
- `render-expressive-fixtures.js` expressive CLI flag `--out` → `--output` (matches `synthesize.py`)
- Multi-emotion dialogue: document-level AF stays neutral (`multiControl`) so grief/joy do not paint the whole clip

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

[2.2.0]: https://github.com/Yuri-Lima/resonara/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Yuri-Lima/resonara/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Yuri-Lima/resonara/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Yuri-Lima/resonara/releases/tag/v1.0.0
