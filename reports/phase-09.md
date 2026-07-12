# Phase 9 — Sign-off Gate Diagnosis

**Date:** 2026-07-12  
**Status:** COMPLETE

## Root cause

The ops runbook (`docs/farm-ops-notes.md`) says:

> Farm sign-off gate: scripts/await-farm.js — polls state.json every 5s and exits 0 when state.status === 'FARM DONE'.

The orchestrator (`scripts/render-farm.js`) writes status values:

- `RUNNING`
- `COMPLETE`
- `CANCELLED`

It **never** writes `FARM DONE`. Therefore the runbook-literal gate can never exit 0 against a successful farm.

## Before (buggy vocabulary)

```
$ node scripts/await-farm-buggy-vocab.js farm-output/matrix/state.json 12000
{"event":"buggy-await-start","accept":"FARM DONE","statePath":"farm-output/matrix/state.json","timeoutMs":12000}
{"event":"buggy-await-poll","status":"COMPLETE"}
{"event":"buggy-await-would-hang","status":"COMPLETE","note":"runbook waits for FARM DONE; orchestrator writes COMPLETE"}
# exit 2 (timeout) — would hang forever without timeout
```

## After (fixed gate)

`scripts/await-farm.js` accepts both `FARM DONE` (runbook) and `COMPLETE` (orchestrator):

```
$ node scripts/await-farm.js --state farm-output/matrix/state.json --timeout-ms 5000
{"event":"await-farm-start","state":".../farm-output/matrix/state.json","accept":["FARM DONE","COMPLETE"],"timeoutMs":5000}
{"event":"await-farm-ok","status":"COMPLETE","elapsedMs":2}
# exit 0
```

## Decision

- **Do not change the runbook text** (ops deliverable is fixed as given).
- **Do change the gate implementation** to accept the orchestrator vocabulary while remaining compatible with a future `FARM DONE` alias.
- Optional: orchestrator could also emit `FARM DONE` as an alias; not required once the gate accepts `COMPLETE`.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| p9-buggy | prove never-firing gate against COMPLETE state | landed (exit 2 / would-hang) | ~12s |
| p9-fixed | prove fixed await exits 0 on COMPLETE | landed (exit 0) | ~2ms |
| p9-report | write diagnosis with before/after | landed | concurrent |

## Adversarial findings (3)

1. **scripts/await-farm.js `parseArgs`** — Failure: env `AWAIT_FARM_ACCEPT` with empty string could accept nothing. Mitigation: default list always includes COMPLETE when accept unset.
2. **docs/farm-ops-notes.md** — Failure: ops still read FARM DONE and may reintroduce buggy scripts. Mitigation: keep buggy-vocab script + this report as regression evidence.
3. **render-farm status vocabulary** — Failure: a third status like SUCCESS would again hang the gate. Mitigation: gate documents accepted set; farm only uses RUNNING|COMPLETE|CANCELLED.

## Evidence check

- [x] Buggy hang evidence pasted
- [x] Fixed exit-0 evidence pasted
- [x] Root cause is vocabulary mismatch, not polling interval
