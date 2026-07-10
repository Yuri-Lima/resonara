# Phase 02 — Baseline + Regression Safety Net

**Date:** 2026-07-10  
**Tag:** `pre-g27` (local only)

## What changed

| File | Rationale |
|------|-----------|
| `reports/phase-02.md` | Record green baseline metrics before feature work |
| git tag `pre-g27` | Diffable regression anchor (never pushed) |

No application code changes. Piper binary + models downloaded via existing `npm run download:piper` (gitignored).

## Commands run (real output)

### Build
```
> resonara@1.0.0 build
> nest build
```
Exit: 0

### Test
```
Test Suites: 30 passed, 30 total
Tests:       133 passed, 133 total
Snapshots:   0 total
Time:        5.392 s
```

### Lint
```
✖ 8 problems (0 errors, 8 warnings)
```
Baseline lint: **0 errors**, 8 pre-existing warnings (ffmpeg, piano dto, queue, tracks).

### Coverage (`npm run test:cov`)
```
All files                  |   77.08 |    55.13 |   69.85 |   79.26 |
```
| Metric | Baseline |
|--------|----------|
| Statements | 77.08% |
| Branches | 55.13% |
| Functions | 69.85% |
| Lines | 79.26% |
| Tests | 133 pass |

Note: package.json coverage thresholds are set to 80% statements/lines; baseline currently reports below threshold (Jest prints threshold failure) while unit tests still pass under `npm test`. Phase 21 target: ≥ baseline + 5 points (statements ≥ 82.08%).

### demo:quick
```
{
  "name": "quick-sentence",
  "engine": "auto",
  "voiceId": "piper:en_US-lessac-medium",
  "words": 16,
  "elapsedMs": 2345,
  "duration": 4.903855,
  "realTimeFactor": 2.0911961620469084
}
```

### demo:all (10 EN samples — all green)
| Sample | Words | Duration (s) | RTF | Elapsed (ms) |
|--------|-------|--------------|-----|--------------|
| quick-sentence | 16 | 4.95 | 2.06 | 2397 |
| paragraph | 74 | 21.77 | 7.55 | 2885 |
| short-article | 471 | 180.53 | 16.52 | 10929 |
| news-article | 2039 | 912.84 | 18.41 | 49587 |
| book-chapter | 5164 | (long) | ~17+ | 100924 |
| technical-doc | (ok) | | 17.58 | |
| ssml-showcase | 47 | 12.50 | 4.91 | 2545 |
| dialogue-script | 75 | 20.30 | 2.73 | 7440 |
| pronunciation-challenge | 91 | 33.62 | 9.69 | 3471 |
| numbers-and-dates | 50 | 33.88 | 8.74 | 3878 |

```
Wrote /private/tmp/trace-swe19-20260710-100350/demo-output/report.json
```
WAV count: 10 files under `demo-output/`.

## Adversarial self-review (Pass B)

1. **Finding:** `npm run test:cov` fails global 80% thresholds while `npm test` is green — later phases might claim "tests pass" while coverage gate is red.  
   **Resolution:** Documented as baseline; Phase 21 must raise coverage ≥ baseline+5 and ideally meet package thresholds. Acceptable for Phase 2 recording.

2. **Finding:** `demo:all` wall time ~4.6 min is dominated by news-article + book-chapter; if a later phase only runs `demo:quick`, regressions in long-form seams could slip.  
   **Resolution:** Phase 19/24 require full `demo:all`; Phase 2 records full suite as the comparison baseline.

3. **Finding:** Coverage table in jest output is truncated for some large files (`tts.service.ts` not fully listed in tail) — absolute baseline for that file is approximate.  
   **Resolution:** Use aggregate All files % as the gate metric (77.08% stmts / 79.26% lines); re-run full cov table in Phase 21.

## Self-review Pass A

No code modified. Baseline is green for build/test/lint-errors/demos. Piper venv + models present. Tag created after this report commit.

## Metrics snapshot (compare later)

| Check | Value |
|-------|-------|
| Tests | 133 pass / 0 fail |
| Lint errors | 0 |
| Lint warnings | 8 |
| Coverage stmts | 77.08% |
| Coverage lines | 79.26% |
| demo:all | 10/10 green |
