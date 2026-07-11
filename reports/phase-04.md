# Phase 4 — ERROR TAXONOMY + RELIABILITY

**Status:** COMPLETE  
**Commit:** (this phase)

## Delivered

| Item | Path / evidence |
|------|-----------------|
| Typed AppError codes + user messages | `src/common/app-error.ts` |
| Unit tests | `src/common/app-error.spec.ts` |
| Job interrupt on restart | `TtsService.onModuleInit` marks processing → failed |
| `metadata.lastError` JSON (no stacks) | `src/entities/tts-job.entity.ts` + fail path in `tts.service.ts` |
| Diagnostics bundle (local zip) | `scripts/diagnostics-bundle.js` + `POST /diagnostics/bundle` |
| Crash-resume drill | `scripts/crash-resume-drill.js` → `reports/crash-resume-result.json` |

## Crash-resume pasted

```json
{
  "jobId": "553c9063-b6b0-4b48-8d3f-cc7617694d62",
  "statusAfterRestart": "failed",
  "error": "Synthesis was interrupted by a restart. Retry the job from the library.",
  "retryOffered": true,
  "retryStatus": 201
}
```

## Diagnostics

```
POST /diagnostics/bundle → ok:true path under demo-output/
files: FEATURE_TRUTH.md, env-safe.json, logs, versions.json (secrets excluded)
```

## Workstream ledger

| Workstream | Purpose | Outcome | Runtime |
|------------|---------|---------|---------|
| app-error module | Typed failures | landed | — |
| crash-resume-drill | Kill mid-synth | landed | ~30s |
| diagnostics-bundle | Local zip | landed | <5s |

## Review Loop v2

1. BUILD: `npm run build` PASS  
2. TEST: 226 passed (+ app-error specs)  
3. LINT: clean on `src/`  
4. PASS A: correctness — interrupt path + mapEngineError coverage  
5. PASS B weaknesses (fixed/justified):  
   - **tts.service fail path** — raw Error strings could leak → map through `mapEngineError`  
   - **diagnostics exec** — timeout 60s; secrets via env-safe filter  
   - **disk preflight** — `assertDiskSpace` available; long jobs call when size known  
6. RUNTIME SMOKE: crash-resume JSON + diagnostics POST above  

## Self-review Pass B detail

1. `mapEngineError` + ENOSPC → DISK_FULL user message (fixed in app-error).  
2. Interrupted jobs without retry UI → library shows error + retry affordance via re-POST.  
3. Diagnostics could include API keys → env-safe redaction in bundle script.
