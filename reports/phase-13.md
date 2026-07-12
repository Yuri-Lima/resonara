# Phase 13 — Teardown + Zero-orphan Proof

**Date:** 2026-07-12  
**Status:** COMPLETE

## Before

```
node …/dist/main.js  (pid 45849) LISTEN localhost:3860
port 3861 free
```

## farm-stop output

```
[farm-stop] SIGTERM lite-server pid=45849
[farm-stop] port 3860: no LISTEN
[farm-stop] port 3861: no LISTEN
[farm-stop] farm-stop complete
{"event":"cancel","status":"CANCELLED"}
```

## After

```
NONE of farm patterns
port 3860 free
port 3861 free
```

## Verdict

Zero orphaned farm workers, status server, soak probes, or lite API on farm ports.

## Adversarial findings (3)

1. **farm-stop.sh** may miss reparented grandchildren — mitigated by port LISTEN kill.
2. **cancel after stop** is no-op when lock gone — acceptable.
3. **Cursor spell-checker dist/main.cjs** can match naive `dist/main` greps — use full path filter.

## Workstream ledger

| ID | Purpose | Outcome |
|----|---------|---------|
| p13-farm-stop | teardown | landed |
| p13-proof | before/after paste | landed |
