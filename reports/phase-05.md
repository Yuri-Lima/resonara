# Phase 5 — Catalog Render

**Date:** 2026-07-12

## What changed

- Expanded catalog manifest: 24 non-soak docs × best engine (piper) × audiobook
- Launched `render-farm.js run` as **monitored background** job
- Concurrent commits inside render window (proof below)
- Matrix manifest prepared (36 cells: 6 docs × piper+platform × 3 profiles)

## Concurrency proof (HARD REQUIREMENT)

| Event | Timestamp (UTC) |
|-------|-----------------|
| Catalog startedAt | **2026-07-12T14:42:16.200Z** |
| Dashboard skeleton commit `82b3001` | 2026-07-12T14:42:48Z (16:42:48+02:00) |
| Matrix manifest commit `00c0412` | 2026-07-12T14:42:48Z |
| Gate/Makefile commit `7a35157` | 2026-07-12T14:43:25Z |
| Dashboard data builder commit `01b0042` | 2026-07-12T14:44:01Z |
| Catalog completedAt | _filled on completion_ |

All concurrent commits land **after** startedAt and **before** completedAt.

## Catalog progress (live samples)

```
poll1: RUNNING done=0/24 inFlight=[en-short-article, en-news, en-book-chapter]
poll later: done=1/24 (en-short-article ok)
```

## On completion

_To be filled: every job valid audio verification, failed jobs list._

## Self-review Pass A

- Reaped ports before start
- Concurrency cap 3; maxInFlight tracked in state
- Status polled via GET /farm/status (not sleep-grep loop)

## Self-review Pass B — 3 findings

1. **TTS server serializes piper** — farm concurrency 3 but only one piper child often runs; effective throughput closer to serial for neural engine. *Justified: engine lock inside product; farm still queues correctly.*
2. **Long docs dominate wall time** — book-chapter 5k words is the critical path. *Accepted for real qualification.*
3. **Matrix is 36 cells not 54** — kokoro/expressive unavailable. *Documented; expand against available engines.*

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-catalog-farm | 24-job catalog render | running→… | … |
| fg-dashboard-skeleton | UI skeleton commit | landed inside window | during catalog |
| fg-matrix-manifest | matrix manifest commit | landed inside window | during catalog |
| subagent-phase-drafts | draft phase reports | in-flight | during catalog |

## Review loop

Deferred to completion of catalog + measure (src unchanged this phase for core product).
