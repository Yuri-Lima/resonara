# Phase 02 — Baseline + Regression Safety Net

**Date:** 2026-07-11  
**Branch:** `feat/g27-parity-session`  
**Tag:** `pre-g27` (local only)

## What changed

| File | Rationale |
|------|-----------|
| `reports/phase-02.md` | Freeze baseline metrics before feature work |
| git tag `pre-g27` | Diffable regression anchor (local only, never pushed) |

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
Time:        6.328 s
```

### Lint (`npx eslint src/ --ext .ts`)
```
✖ 8 problems (0 errors, 8 warnings)
```
0 errors; 8 pre-existing warnings only.

### Coverage (`npm run test:cov`)
```
All files                  |   77.08 |    55.13 |   69.85 |   79.26 |
```
Jest global thresholds (80% statements/lines) not met at baseline — recorded as-is. Target for Phase 21: ≥ baseline + 5 points (statements ≥ 82.08, lines ≥ 84.26) or raise coverage via new module tests.

### demo:quick
```
voiceId: "piper:en_US-lessac-medium"
words: 16, chars: 92, elapsedMs: 2422
duration: 4.860188, realTimeFactor: 2.0066837324525184
output: demo-output/quick-sentence.wav
```

### demo:all (10/10 English samples)
| Sample | RTF | Duration (s) | Words |
|--------|-----|--------------|-------|
| quick-sentence | 2.04 | 4.97 | 16 |
| paragraph | 7.35 | 21.44 | 74 |
| short-article | 15.87 | 181.73 | 471 |
| news-article | 17.14 | 911.95 | 2039 |
| book-chapter | 16.99 | 1799.79 | 5164 |
| technical-doc | 17.21 | 1591.16 | 3102 |
| ssml-showcase | 5.18 | 12.40 | 47 |
| dialogue-script | 2.71 | 20.35 | 75 |
| pronunciation-challenge | 8.92 | 34.73 | 91 |
| numbers-and-dates | 8.96 | 34.91 | 50 |

All demos completed with `engine: auto` → `piper:en_US-lessac-medium`. Piper via `tools/piper-venv`.

## Baseline numbers (freeze)

| Metric | Value |
|--------|-------|
| Test suites | 30 passed |
| Tests | 133 passed |
| Lint errors | 0 |
| Lint warnings | 8 (pre-existing) |
| Coverage statements | 77.08% |
| Coverage lines | 79.26% |
| Coverage branches | 55.13% |
| Demos EN | 10/10 green |
| Default engine | piper lessac-medium |

## Adversarial self-review (Pass B)

1. **Finding:** `npm run test:cov` fails the package.json 80% gate even though unit tests pass — CI that uses test:cov would fail at baseline.  
   **Resolution:** Documented as known baseline debt; Phase 21 must raise coverage ≥ +5 pts on new modules without regressing demos.

2. **Finding:** `resources/piper/` contains Windows `piper.exe` + DLLs on macOS arm64; actual runtime uses `tools/piper-venv`.  
   **Resolution:** Acceptable — download script dual-path; demos prove venv path works. Do not delete Windows assets (desktop packaging).

3. **Finding:** Long demos (news-article ~15 min audio, book-chapter ~30 min) dominate wall-clock; baseline does not record peak RSS.  
   **Resolution:** Phase 20 benchmark matrix will capture peak RSS × engine; baseline is functional correctness only.

## Self-review Pass A

No application code modified. Demos green. Tag is local-only. Ready for feature phases.
