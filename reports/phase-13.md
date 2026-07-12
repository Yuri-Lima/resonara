# Phase 13 — Teardown + Zero-Orphan Proof

**Date:** TBD  
**Status:** DRAFT PLACEHOLDER — fill with REAL data after farm teardown

## What changed

- TBD: run `scripts/farm-stop.sh` (and/or `make farm-stop`) to reap farm resources
- TBD: free ports 3860 / 3861 / 3847
- TBD: reap `farm.lock`, `lite-server.pid`
- TBD: kill any leftover `node` processes matching render-farm / farm-measure / soak-memory-probe
- TBD: paste zero-orphan proof (`lsof` / `ps` empty for farm ports and farm scripts)

## Commands + real output (TBD)

```
# TBD — paste real teardown + proof
bash scripts/farm-stop.sh
lsof -iTCP:3860 -sTCP:LISTEN || true
lsof -iTCP:3861 -sTCP:LISTEN || true
lsof -iTCP:3847 -sTCP:LISTEN || true
ps aux | grep -E 'render-farm|farm-measure|soak-memory-probe' | grep -v grep || true
# expected: no listeners, no farm script processes
```

## Self-review Pass A

- TBD: lock and pid files removed or confirmed stale
- TBD: no farm ports in LISTEN
- TBD: no orphan node farm workers

## Self-review Pass B — 3 findings (TBD)

1. **TBD** — Failure: … Mitigation/justification: …
2. **TBD** — Failure: … Mitigation/justification: …
3. **TBD** — Failure: … Mitigation/justification: …

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| fg-farm-stop | scripts/farm-stop.sh teardown | TBD | TBD |
| fg-orphan-proof | lsof/ps empty proof | TBD | TBD |

## Evidence check

- [ ] Real lsof/ps output pasted (empty = success)
- [ ] farm.lock / lite-server.pid state after stop
- [ ] No silent kill of unrelated user processes beyond farm-reserved ports/scripts
