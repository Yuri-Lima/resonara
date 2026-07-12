# Phase 7 — Engine × Profile Matrix

**Date:** TBD  
**Status:** DRAFT PLACEHOLDER — fill with REAL data when matrix render + measure complete

## What changed

- TBD: expand + run matrix batch (representative docs × available engines × {audiobook, podcast, news})
- TBD: measure matrix cells via `scripts/farm-measure.js`
- TBD: record skipped cells for unavailable engines
- TBD: engine×profile recommendation table (data-derived)

## Commands + real output (TBD)

```
# TBD — paste real command invocations and stdout/stderr
node scripts/render-farm.js run --batch matrix
node scripts/farm-measure.js --batch matrix
# exit codes / cell counts / skipped engines:
```

## Self-review Pass A

- TBD: concurrency cap respected; status via `/farm/status`
- TBD: only available engines expanded
- TBD: every completed cell has valid audio
- TBD: no fabricated RTF/WER

## Self-review Pass B — 3 findings (TBD)

1. **TBD** — Failure: … Mitigation/justification: …
2. **TBD** — Failure: … Mitigation/justification: …
3. **TBD** — Failure: … Mitigation/justification: …

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-matrix-farm | matrix render batch | TBD | TBD |
| bg-matrix-measure | measure matrix WAVs | TBD | TBD |
| fg-recommend-defaults | engine×profile table | TBD | TBD |

## Evidence check

- [ ] Matrix manifest path + job count from real run
- [ ] Metrics artifacts paths listed
- [ ] Skipped cells documented with reason (engine unavailable)
