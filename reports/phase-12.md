# Phase 12 — Dashboard + Release Qualification Report

**Date:** 2026-07-12  
**Status:** COMPLETE

## Deliverables

- `RELEASE_QUALIFICATION.md` — GO verdict argued from measured gates
- `ui/deliverable/` — dark theme dashboard on real `window.FARM_DATA`
- `scripts/build-dashboard-data.js` merges catalog/matrix/soak/packaging/ledger
- `scripts/open-ui.sh` + `make ui` target

## Dashboard sections (real data)

| Section | Source |
|---------|--------|
| Catalog quality table | farm-output/metrics/catalog-metrics.json (24 rows) |
| Engine × profile heatmap | matrix-metrics.json (36 cells) + recommendations |
| Soak stability chart | soak/memory-curve.json (101 samples, plateau) |
| Throughput timeline | catalog/matrix/soak state throughput[] |
| Workstream ledger lanes | reports/workstream-ledger.json |
| Packaging matrix | packaging/result.json |

## Commands

```
$ node scripts/build-dashboard-data.js
{"ok":true,"verdict":"GO","catalogRows":24,"matrixRows":36,...}
```

## Adversarial findings (3)

1. **data.js size** — Failure: large JSON in script tag may slow first paint. Justification: qualification artifact, not production SPA.
2. **WER proxy labeling** — Failure: dashboard may imply real ASR WER. Mitigation: RELEASE_QUALIFICATION caveats; method fields in metrics.
3. **heatmap color only** — Failure: color-only encoding fails for colorblind users. Mitigation: each cell also shows WER/RTF text.

## Workstream ledger

| ID | Purpose | Outcome |
|----|---------|---------|
| p12-rq | RELEASE_QUALIFICATION.md | landed |
| p12-dash-data | build-dashboard-data | landed |
| p12-ui | deliverable dashboard | landed |
