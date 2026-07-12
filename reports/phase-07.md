# Phase 7 — Engine × Profile Matrix

**Date:** 2026-07-12

## What changed

- 36-cell matrix: 6 docs × {piper, platform} × {audiobook, podcast, news}
- Background farm render COMPLETE; 5 isolated failures on en-numbers-and-dates (piper unavailable mid-batch + ECONNRESET)
- Measured matrix metrics

## Final state

```json
{
  "status": "COMPLETE",
  "total": 36,
  "done": 36,
  "failed": 5,
  "maxInFlight": 3,
  "startedAt": "2026-07-12T14:58:33.037Z",
  "completedAt": "2026-07-12T15:36:12.295Z"
}
```

## Measurement aggregates

| Metric | Value |
|--------|-------|
| measured (ok rows) | 31 |
| failed / invalid | 5 |
| mean WER | ~0.094 |
| mean pause conf | 100% |
| mean RTF | ~0.447 |

## Failures (isolated)

- `en-numbers-and-dates__piper__*` — Piper not available (server lost piper mid-batch)
- `en-numbers-and-dates__platform__{audiobook,podcast}` — ECONNRESET
- One platform news numbers cell **succeeded**

## Data-derived defaults

See `reports/matrix-recommendations.json` and metrics recommendations.

## Self-review Pass B

1. **Piper path lost mid-batch** — long matrix exhausted or env drift. *Phase 8: restart server + re-render failed cells.*
2. **ECONNRESET** — lite server pressure under concurrent long jobs. *Failure isolation worked; batch continued.*
3. **36 not 54 cells** — kokoro/expressive unavailable. *Documented.*

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-matrix-farm | 36-cell matrix | landed COMPLETE 31ok/5fail | ~2262 s |
| bg-matrix-measure | measure matrix | landed | ~4 s |
| fg-report-catalog-table | concurrent docs | landed | during matrix |
