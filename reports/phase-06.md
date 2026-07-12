# Phase 6 — Catalog Measurement Sweep

**Date:** 2026-07-12

## What changed

- Ran `farm-measure.js --batch catalog --primary` as background sweep
- Wired metrics into reports; dashboard data builder ready

## Aggregates (REAL)

```json
{
  "total": 24,
  "measured": 24,
  "failed": 0,
  "meanWer": 0.10331986733574183,
  "meanConformance": 1,
  "meanRtf": 0.3463713175419974,
  "invalidAudio": 0
}
```

### Catalog quality table (summary)

| Metric | Value |
|--------|-------|
| measured | 24 |
| invalid audio | 0 |
| mean WER (proxy) | see aggregates |
| mean pause conformance | see aggregates |
| mean RTF | see aggregates |

Full table: `farm-output/metrics/catalog-metrics.md` and `reports/catalog-metrics.md`.

## Concurrent work during sweep

Dashboard data schema wiring + report methodology (measure completed quickly; ffmpeg path).

## Self-review Pass B — 3 findings

1. **WER is duration-density proxy** without whisper — marked `werIsProxy`. *Install whisper for true WER; gate thresholds account for proxy looseness (0.35).*
2. **Pause conformance via silencedetect** not full band probe — high scores on structured audio. *Spot pause-probe remains available.*
3. **Sweep finished very fast** — no whisper fan-out exercised live. *Pool code still unit-tested; real cost is render not measure without STT.*

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-catalog-measure | measure 24 catalog outputs | landed COMPLETE | ~few s |

## Review loop

build/test unchanged (scripts only).
