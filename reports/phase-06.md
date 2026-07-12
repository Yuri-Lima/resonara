# Phase 6 — Catalog Measurement Sweep

**Date:** TBD  
**Status:** DRAFT PLACEHOLDER — fill with REAL data when catalog measurement runs

## What changed

- TBD: run `scripts/farm-measure.js` over `farm-output/catalog/`
- TBD: emit `farm-metrics.json` / `farm-metrics.md` (or catalog-scoped metrics)
- TBD: aggregate WER, pause conformance, RTF, valid-audio rate
- TBD: per-engine / per-language / per-content-type rollups

## Commands + real output (TBD)

```
# TBD — paste real command invocations and stdout/stderr
node scripts/farm-measure.js --batch catalog
# exit code:
# key metrics:
```

## Self-review Pass A

- TBD: every completed catalog WAV has valid header check
- TBD: WER marked `werIsProxy: true` when whisper not used
- TBD: progress file pollable during sweep
- TBD: no fabricated metrics

## Self-review Pass B — 3 findings (TBD)

1. **TBD** — Failure: … Mitigation/justification: …
2. **TBD** — Failure: … Mitigation/justification: …
3. **TBD** — Failure: … Mitigation/justification: …

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-catalog-measure | measure catalog WAVs | TBD | TBD |
| fg-metrics-review | inspect aggregates vs gates | TBD | TBD |

## Evidence check

- [ ] Metrics pasted from real farm-measure output (not invented)
- [ ] Paths to metrics artifacts listed
- [ ] Gate-relevant numbers (WER / pause / RTF / valid-audio) cited with sources
