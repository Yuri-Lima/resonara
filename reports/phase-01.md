# Phase 01 — Competitive Research + Analysis

**Date:** 2026-07-11  
**Type:** Research only (no application code changes)  
**Branch:** `feat/g27-parity-session` from `5bc2c81` (pre-G27)

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
Time:        6.328 s
```

### Lint (`npx eslint src/ --ext .ts`)
```
✖ 8 problems (0 errors, 8 warnings)
```
Pre-existing warnings only (ffmpeg.service unused vars, piano dto, queue module, tracks controller/service). **0 errors.** Exit: 0.

## Research sources used

1. ebook2audiobook — README (multi-engine, CLI/Docker/GUI, chaptered output, OCR, 1158+ langs, voice cloning)
2. Storyteller — platform docs (Whisper → Levenshtein → SMIL EPUB3 immersion reading)
3. Audiobookshelf — product site (library, progress sync, bookmarks, sleep, speed, RSS)
4. kokoro-onnx — README (82M ONNX, multi-lang, ~real-time CPU, quantized ~80MB)
5. faster-whisper — README (CTranslate2, word timestamps, int8 CPU 4× openai/whisper)

## Key findings (summary)

| Project | Resonara gap closed by |
|---------|------------------------|
| ebook2audiobook | Engine plurality + CLI + watch (Pillars B, F) |
| Storyteller | Forced align + karaoke + EPUB3 MO (Pillar C) |
| Audiobookshelf | Library + playback UX + RSS (Pillars D, E) |
| Kokoro | Third neural engine (Pillar B) |
| faster-whisper | QA WER + alignment anchors (Pillar A) |

## Adversarial self-review (Pass B)

1. **Finding:** `COMPETITIVE_ANALYSIS.md` feature matrix marks Resonara-today OCR as ❌ based on code inventory, not a live document-import OCR probe.  
   **Resolution:** Acceptable for research phase — document-extractor was inspected; OCR is an explicit NON-goal.

2. **Finding:** Storyteller site returned sparse HTML via curl; algorithm details rely on public project description, not a full GitLab source walk.  
   **Resolution:** Core algorithm (Whisper → fuzzy match → SMIL) is well-documented publicly; sufficient for gap ranking.

3. **Finding:** Gap ranking is qualitative (value÷cost), not measured with user interviews.  
   **Resolution:** Acceptable for engineering roadmap; Phase 2 baseline will quantify our starting metrics.

## Self-review Pass A

Docs only — no type/runtime risk. No code paths modified. Baseline tree green before any feature work.
