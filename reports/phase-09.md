# Phase 9 — Sign-off Gate Diagnosis

**Date:** TBD  
**Status:** DRAFT PLACEHOLDER — fill with REAL data when sign-off gate is exercised

## What changed

- TBD: diagnose `COMPLETE` (orchestrator) vs `FARM DONE` (ops runbook) vocabulary mismatch
- TBD: exercise `scripts/await-farm.js` / sign-off gate against real `state.json`
- TBD: fix or document the gate so qualification reports wait on the correct terminal status
- TBD: update `docs/farm-ops-notes.md` if behavior changes

## Commands + real output (TBD)

```
# TBD — paste real sign-off gate runs
node scripts/await-farm.js
# observed state.status values:
# gate exit code / timeout behavior:
```

## Self-review Pass A

- TBD: gate polls `state.json` (or `/farm/status`), not sleep-grep loops
- TBD: terminal statuses enumerated and tested
- TBD: ops notes match actual orchestrator vocabulary (or adapter maps them)

## Self-review Pass B — 3 findings (TBD)

1. **TBD** — Failure: … Mitigation/justification: …
2. **TBD** — Failure: … Mitigation/justification: …
3. **TBD** — Failure: … Mitigation/justification: …

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| fg-signoff-diagnose | COMPLETE vs FARM DONE | TBD | TBD |
| fg-await-farm | run/fix await-farm gate | TBD | TBD |
| fg-ops-notes | align docs/farm-ops-notes.md | TBD | TBD |

## Evidence check

- [ ] Real `state.status` samples pasted
- [ ] Gate command exit codes from real runs
- [ ] Docs change (if any) linked to observed behavior
