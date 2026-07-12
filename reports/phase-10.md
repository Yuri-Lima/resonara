# Phase 10 — Novel-Length Soak

**Date:** TBD  
**Status:** DRAFT PLACEHOLDER — fill with REAL data when soak batch + memory probe complete

## What changed

- TBD: run soak batch on `samples/catalog/soak-novel.txt` (~50k words)
- TBD: primary engine × audiobook profile
- TBD: `scripts/soak-memory-probe.js` (or equivalent) RSS curve sampling
- TBD: prove RSS plateau (no monotonic growth across chunk samples)

## Commands + real output (TBD)

```
# TBD — paste real soak + memory probe outputs
node scripts/render-farm.js run --batch soak
node scripts/soak-memory-probe.js
# soak state.status / done / failed:
# RSS samples / plateau verdict:
```

## Self-review Pass A

- TBD: soak job(s) completed or failures isolated and explained
- TBD: RSS sampled across chunks with timestamps
- TBD: plateau criterion applied as documented in FARM_ARCHITECTURE.md
- TBD: no fabricated memory curves

## Self-review Pass B — 3 findings (TBD)

1. **TBD** — Failure: … Mitigation/justification: …
2. **TBD** — Failure: … Mitigation/justification: …
3. **TBD** — Failure: … Mitigation/justification: …

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-soak-farm | novel-length render | TBD | TBD |
| bg-soak-memory | RSS plateau probe | TBD | TBD |

## Evidence check

- [ ] Soak state.json path + final status pasted
- [ ] RSS sample table or artifact path (real numbers)
- [ ] Plateau / leak verdict with criterion reference
