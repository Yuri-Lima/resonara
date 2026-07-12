# Phase 8 — Qualification Gate + Kill Obsolete

**Date:** TBD  
**Status:** DRAFT PLACEHOLDER — fill with REAL data when gate evaluation runs

## What changed

- TBD: evaluate catalog + matrix metrics against `FARM_ARCHITECTURE.md` gate thresholds
- TBD: GO / NO-GO decision with measured evidence
- TBD: cancel/kill any obsolete in-flight batches on NO-GO systematic failure
- TBD: document failed-job rate and isolated vs systematic failures

## Commands + real output (TBD)

```
# TBD — paste real gate evaluation commands and outputs
node scripts/farm-gate.js   # or equivalent gate check
node scripts/render-farm.js cancel   # if obsolete batch kill required
# gate verdict:
```

## Self-review Pass A

- TBD: thresholds applied as documented (WER / pause / RTF / valid-audio / fail rate)
- TBD: obsolete batches cancelled promptly with child reap
- TBD: no silent pass on missing metrics

## Self-review Pass B — 3 findings (TBD)

1. **TBD** — Failure: … Mitigation/justification: …
2. **TBD** — Failure: … Mitigation/justification: …
3. **TBD** — Failure: … Mitigation/justification: …

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| fg-gate-eval | apply qualification thresholds | TBD | TBD |
| fg-kill-obsolete | cancel stale batches if needed | TBD | TBD |

## Evidence check

- [ ] Each gate criterion cited with measured value + threshold
- [ ] Cancel/reap actions (if any) have timestamps + PIDs
- [ ] Verdict is GO or NO-GO with rationale — not PENDING without reason
