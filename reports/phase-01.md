# Phase 01 — Competitive Research + Analysis

**Date:** 2026-07-10  
**Type:** Research only (no application code changes)  
**Branch:** `feat/g27-competitive-parity` from `feat/tts-neural-longform`

## What changed

| File | Rationale |
|------|-----------|
| `COMPETITIVE_ANALYSIS.md` | Catalog of 5 landscape projects, feature matrix, top-10 gaps, non-goals |
| `IMPROVEMENT_ROADMAP.md` | Pillars A–F mapped to phases with per-pillar risks |
| `reports/phase-01.md` | This evidence report |

## Commands run (real output)

### Build
```
> resonara@1.0.0 build
> nest build
```
Exit: 0 (clean)

### Test
```
Test Suites: 30 passed, 30 total
Tests:       133 passed, 133 total
Snapshots:   0 total
Time:        6.086 s
```

### Lint (`npx eslint src/ --ext .ts`)
```
✖ 8 problems (0 errors, 8 warnings)
```
Pre-existing warnings only (ffmpeg.service unused vars, piano dto, queue module, tracks controller/service). **0 errors.** Exit: 0.

## Research sources used

1. ebook2audiobook — feature set from project description (multi-engine, CLI/Docker/GUI, chaptered output, OCR, 1158+ langs)
2. Storyteller — storyteller-platform.dev algorithm docs (Whisper → Levenshtein chapter locate → sentence SMIL → EPUB3 MO)
3. Audiobookshelf — product feature set (library, progress sync, bookmarks, sleep, speed, RSS)
4. kokoro-onnx / Kokoro-82M — ONNX CPU real-time, ~50 voices, multi-lang, TTS Arena ranking
5. faster-whisper vs whisper.cpp — word_timestamps, int8 CPU; **decision lean: faster-whisper in tools venv** (matches Piper venv pattern, clean word JSON)

## Key findings (summary)

- Resonara already leads on offline desktop packaging, production audio post, SSML/dict/dialogue, dual-mode lite/full.
- Largest gaps: QA WER loop, engine plurality (Kokoro), read-along/EPUB3 MO, library listening UX, RSS, real CLI.
- Highest leverage first: preprocess → Whisper → WER → Kokoro → alignment → library → distribute → automate.

## Adversarial self-review (Pass B) — 3 findings

1. **Finding:** `COMPETITIVE_ANALYSIS.md` matrix marks ebook2audiobook watch-folder as ⚠️ without a primary-source commit citation — could overstate automation maturity.  
   **Resolution:** Acceptable for planning; Phase 18 implements Resonara watch mode independently; matrix uses ⚠️ not ✅.

2. **Finding:** STT decision (faster-whisper) is recorded here before Phase 5’s machine-local RTF measurement — risk of reverse if whisper.cpp is faster on this Mac.  
   **Resolution:** Phase 5 will re-confirm with install + one real transcription; roadmap already lists whisper.cpp as alternative.

3. **Finding:** Gap rank #10 (EPUB3 MO) is “medium–high cost” but Phase 13 is a hard requirement — schedule risk if alignment (Phase 10) slips.  
   **Resolution:** Acceptable; Phase 13 degrades to structural-only export tests if full EPUB fixture is late; Phase 19 re-validates.

## Metrics

| Metric | Value |
|--------|-------|
| Tests | 133 pass |
| Lint errors | 0 |
| Lint warnings (baseline) | 8 |
| Code files changed | 0 |

## Self-review Pass A

Re-read both docs for consistency with repo state (`src/tts/*` has piper+platform, proportional `timestamp-aligner`, no library/RSS/CLI). No code paths touched. Baseline green before feature work.

## Commit

`docs(g27): competitive analysis and improvement roadmap`
