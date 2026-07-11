# Resonara G28 Forensic Audit Report

**Branch:** main (local audit commits)  
**Baseline tag:** `pre-g28` (local only)  
**Date:** 2026-07-12  
**Scope:** Post-merge debt after PRs #2–#10 (~18.2k LOC TypeScript)

## Executive summary

Main absorbed seven feature PRs across three merge waves plus pause prosody and v2.0.0. A forensic nine-pass audit produced **34 MASTER_TODO findings**. **20 were fixed** with per-finding commits; **14 deferred** with written rationales (mostly L-effort god-file / duplication extractions).

| Metric | Before (pre-g28) | After |
|--------|------------------|-------|
| Unit tests | 226 pass / 1 skip | **241 pass** / 1 skip |
| Coverage statements | 77.38% | **77.62%** |
| Coverage lines | 79.57% | **79.74%** |
| ESLint | 0 err / 8 warn | **0 err / 0 warn** |
| jscpd src duplicated lines | 2.31% (50 clones) | 2.54% (53 clones; +tests) |
| Leak probe handles | flat 22 | flat 24 |
| Leak probe tmp files | flat 12 | flat 13 |
| Leak probe RSS Δ (10 runs) | +71 MB | +103 MB (V8/job history; handles/tmp flat) |
| `any` / `as any` / @ts-ignore | 0 | 0 |
| demo:all | 10/10 green | 10/10 green (baseline) |

## Findings by category

| Category | Fixed | Deferred |
|----------|------:|---------:|
| Security | 6 | 2 |
| Leaks / resources | 5 | 2 |
| Async / errors | 2 | 1 |
| Duplication | 0 | 5 |
| Architecture | 2 | 2 |
| Performance | 1 | 3 |
| Tests / coverage | 2 | 1 |
| Polish / docs | 2 | 0 |

Full table: [MASTER_TODO.md](./MASTER_TODO.md). Evidence: [reports/findings.md](./reports/findings.md).

## High-impact fixes shipped

1. **TODO-01** Path traversal blocked in lite storage `keyPath` (+ probe tests).
2. **TODO-02** PowerShell `-EncodedCommand` + voice/path allowlist (injection probe tests).
3. **TODO-03/05/06** Spawn timeout + single-settle on platform, Piper, Kokoro, ad-hoc ffmpeg.
4. **TODO-04/11/34** Shutdown hooks, `forbidNonWhitelisted`, text/rate caps, loopback bind for lite.
5. **TODO-08/09/10** Safe multer names, model-key containment, STT size limit.
6. **TODO-12/23** In-flight delete guard; failed-job workDir purge.
7. **TODO-13** Voice list TTL cache.
8. **TODO-15/16/26** Language + Kokoro specs; dead exports removed; docs archived to `docs/history/`.

## Leak curves (handles/tmp)

### Before (Phase 5)
```
run | serverRSS_MB | handles | tmpFiles
1 | 218.3 | 22 | 12
…
10 | 289.5 | 22 | 12
RSS delta: +71.2 MB; handles 0; tmp 0
```

### After (Phase 20)
```
run | serverRSS_MB | handles | tmpFiles
1 | 217.5 | 24 | 13
…
10 | 320.7 | 24 | 13
RSS delta: +103.2 MB; handles 0; tmp 0
```

**Interpretation:** Open handles and temp files plateau (no process/file descriptor leak). RSS still climbs under sequential platform TTS jobs (V8 + TypeORM job rows retained in SQLite). Further RSS work is deferred (TODO-14/27).

## Duplication

jscpd structural % did not drop (large extractions deferred as TODO-17–20/24–25). Semantic high-risk dups mitigated via process settled-gates rather than full process-runner extraction.

## God-file map (status)

| File | Before LOC | After | Status |
|------|----------:|------:|--------|
| tts.service.ts | 1990 | ~2010 | Deferred full split (TODO-20); targeted fixes in-file |
| ffmpeg.service.ts | 1431 | ~1425 | Lint cleanup; split deferred |

## Convergence

| Pass | jscpd % | leak handles flat? | eslint err | new findings |
|------|--------:|--------------------|------------|--------------|
| C1 | 2.54% | yes | 0 | residual RSS growth only (documented) |
| C2 | 2.54% | yes | 0 | none new |

Two consecutive mechanical passes with no new actionable findings beyond deferred items.

## Workstream ledger (session)

| Stream | Outcome |
|--------|---------|
| 7 parallel audit subagents | collected + spot-verified |
| leak-probe (×2) | tables pasted |
| jscpd | before/after pasted |
| demo:all | 10/10 green |

## References

- [MASTER_TODO.md](./MASTER_TODO.md)
- [reports/merge-archaeology.md](./reports/merge-archaeology.md)
- [reports/findings.md](./reports/findings.md)
- [reports/INDEX.md](./reports/INDEX.md)
- [ui/deliverable/](./ui/deliverable/) — audit dashboard section
