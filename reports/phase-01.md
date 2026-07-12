# Phase 1 — Baseline + Farm Architecture

**Date:** 2026-07-12  
**Branch:** main @ 6c0652c (pre-g30)  
**Product:** Resonara 2.2.0

## What changed

- Recorded baseline: build, test, lint, coverage, `demo:quick`, engine/voice/profile inventory.
- Wrote `FARM_ARCHITECTURE.md` (corpus, catalog/matrix/soak split, orchestrator, measurement plan, gates).
- Wrote `docs/farm-ops-notes.md` **verbatim** (sign-off gate waits for `FARM DONE` — Phase 9 concern).
- Local tag `pre-g30` (never pushed).
- `reports/baseline-g30.json` machine-readable snapshot.

## Commands + real output

### Build

```
> resonara@2.2.0 build
> nest build
(exit 0, clean)
```

### Test

```
Test Suites: 46 passed, 46 total
Tests:       1 skipped, 273 passed, 274 total
Time:        5.738 s
```

### Lint

```
npx eslint src/ --ext .ts
✖ 1 problem (0 errors, 1 warning)
  src/tts/expressive-tts.spec.ts:1:13  warning  'fs' is defined but never used
EXIT:0
```

### Coverage

```
All files  |  76.48 stmts | 55.85 branch | 64.33 funcs | 78.62 lines
Jest: global coverage threshold for statements (80%) not met: 76.48%
Jest: global coverage threshold for lines (80%) not met: 78.62%
(tests still green; thresholds pre-existing on main)
```

### demo:quick

```
Demo: quick-sentence lang=en
{
  "name": "quick-sentence",
  "language": "en",
  "engine": "platform",
  "voiceId": "platform:Albert",
  "words": 16,
  "elapsedMs": 3006,
  "fileSize": 1081050,
  "duration": 7.506583,
  "realTimeFactor": 2.497199933466401
}
```

### Engine inventory (`GET /tts/engines`)

| Engine | Available | Voices | Languages |
|--------|-----------|--------|-----------|
| expressive | false | 0 | — |
| kokoro | false | 0 | — |
| piper | false (download started) | 0 | — |
| **platform** | **true** | **184** | en (60), pt-BR (10) |

### Languages

- `en` — English
- `pt-BR` — Português (Brasil)

### Pause profiles (`listPauseProfiles`)

- `audiobook` (default)
- `podcast` (~20% tighter)
- `news` (~35% tighter)

### Matrix dimensions for the farm

- Engines at runtime: whatever `engineStatus()` reports available (platform now; piper if install succeeds).
- Languages: en, pt-BR
- Profiles: audiobook, podcast, news
- Catalog: non-soak corpus docs × best engine × language × audiobook
- Matrix: 6-doc subset × available engines × 3 profiles

## Self-review Pass A (correctness)

- Architecture matches real API: `POST /tts/synthesize`, `GET /tts/jobs/:id`, download.
- Status vocabulary `RUNNING|COMPLETE|CANCELLED` documented; ops mismatch deferred to Phase 9 by design.
- Verbatim ops notes preserved (no premature "fix").
- Baseline numbers pasted from real runs.

## Self-review Pass B — 3 adversarial findings

1. **FARM_ARCHITECTURE.md / gate thresholds vs platform RTF**  
   Platform RTF on demo was ~2.5; long docs may exceed a tight budget.  
   *Mitigation:* thresholds use engine-specific budgets (platform ≤ 5.0 RTF); re-validate after catalog.

2. **Piper/Kokoro unavailable at baseline**  
   Matrix cells for missing engines will be skipped.  
   *Mitigation:* download-piper running in background; farm expands against live availability; report must list skipped cells.

3. **Coverage below 80% threshold on main**  
   Pre-existing; not introduced by this phase.  
   *Justification:* Phase 1 is design-only; farm unit tests in Phases 2–4 will raise coverage of new scripts (scripts are plain JS, not under src/ coverage).

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-download-piper | Install Piper binary + voices | running (background) | in-flight |
| fg-build | nest build | landed (clean) | ~few s |
| fg-test | jest suite | landed 273 pass | ~5.7 s |
| fg-lint | eslint src | landed 0 errors | ~few s |
| fg-cov | jest --coverage | landed 76.48% stmts | ~7.5 s |
| fg-demo-quick | demo:quick | landed platform RTF 2.5 | ~3 s |
| fg-inventory | /tts/engines + profiles | landed | ~10 s |

## Evidence check

- All metrics above are pasted from command output in this session.
- No fabricated WER/RTF from farm runs yet (farm not built).

## Next

Phase 2: `scripts/build-corpus.js` as monitored background job; orchestrator skeleton while it runs.
