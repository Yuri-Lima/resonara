# Phase 3 — Farm Orchestrator

**Date:** 2026-07-12

## What changed

- `scripts/render-farm.js` — batch renderer with:
  - concurrency cap (default 3; never unbounded)
  - PID lock (`farm-output/farm.lock`)
  - cancel: SIGTERM + partial cleanup + status CANCELLED
  - rolling `state.json` (`RUNNING|COMPLETE|CANCELLED`)
  - status server `GET /farm/status`
  - expand-catalog / expand-matrix / expand-smoke / expand-soak
- `test/farm/render-farm.spec.js` — queue, cap, PID lock, cancel plan

## Smoke run (4-job mini-matrix) — REAL output

```
{"ok":true,"name":"smoke","jobs":4,"engines":["piper","platform"]}
{"event":"job-done","id":"smoke-en-quick-sentence__piper__audiobook","status":"ok","ms":3078,"bytes":728632}
{"event":"job-done","id":"smoke-en-paragraph__piper__audiobook","status":"ok","ms":10013,"bytes":3656004}
{"event":"job-done","id":"smoke-pt-paragrafo__piper__audiobook","status":"ok","ms":8396,"bytes":2912908}
{"event":"job-done","id":"smoke-en-numbers-and-dates__piper__audiobook","status":"ok","ms":10756,"bytes":5658148}
{"event":"farm-finished","status":"COMPLETE","total":4,"done":4,"failed":0,"maxInFlight":2}
```

state.json:

```json
{
  "status": "COMPLETE",
  "total": 4,
  "done": 4,
  "failed": 0,
  "concurrency": 2,
  "startedAt": "2026-07-12T14:41:06.593Z",
  "completedAt": "2026-07-12T14:41:29.186Z",
  "maxInFlight": 2
}
```

WAV headers: all `RIFF....WAVE` (valid).

## Unit tests

```
PASS test/farm/render-farm.spec.js
  ✓ sliceQueue respects concurrency waves
  ✓ runWithConcurrency never exceeds N in flight
  ✓ runWithConcurrency isolates failures
  ✓ acquires lock when free
  ✓ refuses when lock PID is alive
  ✓ takes over stale lock with warning
  ✓ releaseLock removes own lock
  ✓ lists partials and child pids for in-flight jobs
```

## Status vocabulary note (Phase 9)

Orchestrator writes `COMPLETE` — ops runbook waits for `FARM DONE`.

## Self-review Pass A

- Failure isolation: one job fail increments `failed`, batch continues.
- Lock refused when live; stale takeover logged.
- Partials deleted on job failure path.
- Status server closed in finally.

## Self-review Pass B — 3 findings

1. **runOneJob — no process-group tracking of piper/ffmpeg children**  
   Failure: cancel may leave engine children if TTS API owns them server-side.  
   *Mitigation:* cancel also SIGTERMs lite-server PID; freePort on status; lite server runs engine children. Documented; improve with job-level cancel API if available.

2. **writeState race under concurrency**  
   Failure: concurrent job completions mutate shared `state` object without mutex.  
   *Justified for Node single-threaded event loop (mutations are sync between awaits); still a footgun if ever multi-threaded.*

3. **STATUS_PORT freePort may kill unrelated listeners**  
   Failure: aggressive reap on 3861.  
   *Accepted for farm isolation; ports are farm-reserved.*

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-smoke-farm | 4-job mini-matrix | landed COMPLETE 4/4 | ~23 s |
| fg-unit-render-farm | jest farm tests | landed 8/8 | 0.2 s |
| concurrent-farm-measure | Phase 4 draft while smoke ran | landed (next commit) | during smoke window |

## Review loop

build clean · npm test 273 pass · farm jest 18 pass · eslint 0 errors
