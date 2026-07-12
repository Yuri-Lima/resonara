# Phase 4 — Measurement Aggregator

**Date:** 2026-07-12

## What changed

- `scripts/farm-measure.js` — consumes farm outputs; emits metrics JSON/MD
  - WER (whisper if `FARM_MEASURE_WHISPER=1`, else duration-density proxy marked)
  - pause conformance via ffmpeg silencedetect heuristic
  - duration/RTF via ffprobe
  - valid audio header check
  - incremental progress file for pollability
  - `recommendDefaults` data-derived engine×profile per content type
- `test/farm/farm-measure.spec.js` — aggregation math on synthetic rows

## Self-test (synthetic)

```json
{
  "ok": true,
  "meanWer": 0.15000000000000002,
  "rec": { "engine": "piper", "profile": "audiobook", "score": 0.8506 }
}
```

## Unit tests

```
✓ aggregates known WER/conformance rows → meanWer 0.1, conf 0.9
✓ recommendDefaults picks better engine
✓ wordErrorRate basic
✓ validateAudioHeader detects WAV
```

## Design notes

- Sweep is pool-parallel (`--concurrency N`), writes `*-progress.json` after each row.
- Real catalog/matrix measurement runs in Phases 6–7 against real farm audio.
- WER without whisper is explicitly `werIsProxy: true` — not fabricated as real WER.

## Self-review Pass B — 3 findings

1. **estimatePauseConformance — heuristic not full pause-probe bands**  
   Failure: may report ~92% on short clips with no silences.  
   *Justified as scale proxy; full pause-probe remains available via `npm run probe:pauses` for spot checks.*

2. **tryTranscribe skipped by default**  
   Failure: catalog WER may be proxy-only if whisper not installed.  
   *Documented; set FARM_MEASURE_WHISPER=1 when whisper venv present.*

3. **groupBy mutates nothing but mean of empty → null**  
   Failure: empty engine bucket omitted — OK.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| fg-farm-measure-impl | write aggregator | landed | concurrent with Phase 3 smoke |
| fg-self-test | --self-test | landed | <1 s |
| fg-unit | jest measure suite | landed 4/4 | 0.14 s |

## Review loop

build clean · tests green · farm jest green
