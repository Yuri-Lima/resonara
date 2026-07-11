# Phase 1 — BASELINE + THE PROBE FLEET

**Date:** 2026-07-12  
**Baseline:** `pre-v2` @ f1e47bcd5d845e9ea50e4c376253cfdc1ce5846e  
**Status:** COMPLETE

## 1a. Baseline (real output)

### build
```
> resonara@1.0.0 build
> nest build
(exit 0)
```

### test
```
Test Suites: 44 passed, 44 total
Tests:       1 skipped, 221 passed, 222 total
Time:        6.77 s
```

### lint
```
✖ 8 problems (0 errors, 8 warnings)  # unused vars only
```

### coverage
```
All files | 77.38% stmts | 56.39% branch | 66.24% funcs | 79.57% lines
Jest: global threshold 80% not met for statements/lines
```

### npm audit
```
31 vulnerabilities (3 low, 21 moderate, 7 high)
```

### demo:quick
```
engine: platform  voiceId: platform:Albert
words: 16  duration: 7.506583  fileSize: 1081050  RTF: 2.13
```

### tag
```
pre-v2 → f1e47bcd5d845e9ea50e4c376253cfdc1ce5846e (LOCAL)
```

## 1b–d. Probe fleet

- Harness: `scripts/probe-fleet.js` on :3848
- 12 subagents in parallel
- Spot-checks: Kokoro, preprocessor, pt-BR (orchestrator)

### Fleet summary (corrected)

| Feature | Corrected verdict | Decision |
|---------|-------------------|----------|
| Kokoro | WORKING | KEEP |
| Whisper | WORKING (201≠fail) | KEEP |
| QA | WORKING | KEEP |
| Alignment | WORKING | KEEP |
| Library | WORKING | KEEP |
| Feeds | WORKING | KEEP |
| Cover | WORKING | KEEP |
| EPUB | PARTIAL | FIX |
| Preprocessor | PARTIAL | FIX |
| CLI | PARTIAL | FIX |
| Watch | WORKING | KEEP |
| pt-BR | WORKING | KEEP |

Full table + evidence: `FEATURE_TRUTH.md`

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| pre-v2 | baseline pin | landed | <1s |
| download-piper | engines/models | landed | ~4m |
| download-whisper | STT | landed | ~3m |
| download-kokoro | neural TTS | landed | ~2m |
| server-3848 | probe API | landed | session |
| probe-fleet | 12 probes | landed | 107s |
| subagents 1–12 | parallel probes | landed | ~1–3m ea |
| spot×3 | verification | landed | ~25s ea |

## Review Loop v2

1. BUILD: clean (pre-change)
2. TEST: 221 pass
3. LINT: 0 errors
4. SELF-REVIEW A: FEATURE_TRUTH evidence-linked; no code fixes in this commit
5. SELF-REVIEW B (3 weaknesses):
   - Probe harness treated 201 as failure → documented, not product bug
   - Concurrent fleet load caused one ECONNRESET → Phase 4 reliability
   - EPUB returns overlay dir not zip → Phase 2/3 fix queue
6. RUNTIME SMOKE: demo:quick + 3 spot-checks pasted above
7. This report + FEATURE_TRUTH.md
8. COMMIT: chore(v2): phase 1 baseline + feature-truth audit

## Process note

Stale server on :3847 pointed at `trace-swe22-…` — probes deliberately used :3848 with this workspace's piper/kokoro/whisper paths.
