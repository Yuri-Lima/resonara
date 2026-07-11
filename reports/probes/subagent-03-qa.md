# Probe: TTS QA loop (WER + thresholds)

**Verdict:** WORKING  
**Fix estimate:** S (only if binding :3847 to a Whisper-ready CWD)  
**Timestamp:** 2026-07-11T22:15:35Z  
**Primary proof host:** `http://127.0.0.1:3855` (`npm run qa:sample` / `QA_PORT=3855`)  
**Designated host note:** `http://127.0.0.1:3847` is a *different* process (CWD `trace-swe22-…`) without Whisper — QA cannot run there.

## Summary

The synthesize → Whisper STT → WER → threshold loop is **implemented and runtime-proven**. With Whisper available:

- `POST /tts/synthesize` with `qa: "full"` stores a full `JobQaSummary` on the job.
- `GET /tts/jobs/:id/qa` returns `mode`, `aggregateWer`, `threshold` (default **0.1**), `failedCount`, `sampledCount`, and per-chunk `wer` / `qaFailed` / `retried` / `transcript` / `missing` / `inserted` / `referenceTokens`.
- Threshold application: `qaFailed = wer > threshold` (default 0.1); optional one-shot resynthesis when over threshold.

## Runtime evidence

### A. `npm run qa:sample` (port 3855, this repo, Whisper available)

Command: `QA_PORT=3855 npm run qa:sample` → sample `quick-sentence`.

```json
{
  "name": "quick-sentence",
  "jobId": "3a24089a-3fd2-48ba-bfa7-3d6f071acfd3",
  "elapsedMs": 3030,
  "aggregateWer": 0,
  "failedCount": 0,
  "sampledCount": 1,
  "chunks": [
    {
      "chunkIndex": 0,
      "wer": 0,
      "transcript": "The quick brown fox jumped gracefully over the lazy sleeping dog near the old stone bridge.",
      "missing": [],
      "inserted": [],
      "referenceTokens": 16,
      "qaFailed": false,
      "retried": false
    }
  ],
  "truncated": false
}
```

### B. `GET /tts/jobs/:id/qa` after sample job

```http
GET http://127.0.0.1:3855/tts/jobs/3a24089a-3fd2-48ba-bfa7-3d6f071acfd3/qa
```

```json
{
  "mode": "full",
  "aggregateWer": 0,
  "failedCount": 0,
  "sampledCount": 1,
  "threshold": 0.1,
  "chunks": [
    {
      "chunkIndex": 0,
      "wer": 0,
      "transcript": "The quick brown fox jumped gracefully over the lazy sleeping dog near the old stone bridge.",
      "missing": [],
      "inserted": [],
      "referenceTokens": 16,
      "qaFailed": false,
      "retried": false
    }
  ]
}
```

**WER fields present:** `aggregateWer`, per-chunk `wer`, `referenceTokens`, `missing`, `inserted`, `transcript`.  
**Threshold fields present:** top-level `threshold: 0.1`, per-chunk `qaFailed: false` (WER 0 ≤ 0.1), `retried: false`.

### C. Independent synth on workspace server :3848

- `GET /stt/health` → Whisper available  
- `POST /tts/synthesize` `{ qa: "full", engine: "piper", text: quick-sentence }` → job `04b97aeb-670e-4767-89ff-3e6049360433`  
- `GET /tts/jobs/04b97aeb-670e-4767-89ff-3e6049360433/qa` → same shape: `mode=full`, `aggregateWer=0`, `threshold=0.1`, `qaFailed=false`

### D. Designated server :3847 (environment gap — not feature code)

Process PID 15469 CWD = `/private/tmp/trace-swe22-20260711-014507` (not this repo).

```http
GET http://127.0.0.1:3847/stt/health
→ {"available":false,"detail":"faster-whisper not installed. Run: node scripts/download-whisper.js"}
```

```http
POST /tts/synthesize qa=full → job 5bbd22fa-37d8-41a7-8311-dbb0eedd1ba8 (completed)
GET /tts/jobs/5bbd22fa-37d8-41a7-8311-dbb0eedd1ba8/qa
→ {
    "mode": "off",
    "aggregateWer": null,
    "chunks": [],
    "message": "No QA data for this job"
  }
```

When Whisper is unavailable, `SynthesisQaService.isAvailable()` is false, so the TTS path skips QA entirely (no WER stored). This is expected fail-soft behavior, not a missing implementation.

## Deliberate-break detection

| Item | Status |
|------|--------|
| Dedicated runtime module `src/tts/qa/deliberate-break.ts` | **Does not exist** |
| Unit proof `src/tts/qa/deliberate-break.spec.ts` | **Exists** — Phase 7 proof that truncating ~30% of words yields WER ≫ 0.1 and `qaFailed` |
| Runtime threshold path | **Exists** in `synthesis-qa.service.ts` (`DEFAULT_THRESHOLD = 0.1`, `qaFailed: result.wer > threshold`, optional retry) |

Unit tests:

```
PASS src/tts/qa/deliberate-break.spec.ts
PASS src/tts/qa/wer.spec.ts
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
```

Deliberate-break is a **unit-level detection proof** over `computeWer` + threshold, not a separate production detector service. Runtime still applies the same threshold to live Whisper transcripts.

## Code map

| Path | Role |
|------|------|
| `/private/tmp/trace-swe23-20260712-000916/src/tts/qa/wer.ts` | DP WER + soft token match |
| `/private/tmp/trace-swe23-20260712-000916/src/tts/qa/normalize.ts` | Text normalization for WER |
| `/private/tmp/trace-swe23-20260712-000916/src/tts/qa/synthesis-qa.service.ts` | `qaChunk` / `qaWithRetry` / `aggregate`; threshold 0.1 |
| `/private/tmp/trace-swe23-20260712-000916/src/tts/qa/deliberate-break.spec.ts` | Truncation / swap WER proofs |
| `/private/tmp/trace-swe23-20260712-000916/src/tts/tts.service.ts` | Per-chunk sample/full QA during synthesis |
| `/private/tmp/trace-swe23-20260712-000916/src/tts/tts.controller.ts` | `GET jobs/:id/qa`, `POST jobs/:id/qa/rerun` |
| `/private/tmp/trace-swe23-20260712-000916/scripts/qa-run.js` | `npm run qa:sample` runner |

## Gaps

1. **:3847 designated server** runs from another tree without Whisper → QA silently off (`aggregateWer: null`). Bind PORT 3847 to this repo CWD (or install Whisper there) for end-to-end on that port.
2. **No standalone deliberate-break runtime module** — only unit tests + live threshold flags.
3. Live probe did not exercise a *failing* WER path (retry / `qaFailed: true`); clean round-trip WER=0 only. Fail path covered by unit tests.

## Structured

```json
{
  "feature": "TTS QA loop (WER + thresholds)",
  "verdict": "WORKING",
  "gaps": [
    "Designated :3847 process is wrong CWD (swe22) without Whisper → No QA data",
    "deliberate-break exists only as unit proof (no deliberate-break.ts runtime module)",
    "Live run did not observe qaFailed=true / retry path (WER=0 clean sample)"
  ],
  "fixEstimate": "S",
  "evidence": {
    "qaSampleJobId": "3a24089a-3fd2-48ba-bfa7-3d6f071acfd3",
    "port": 3855,
    "aggregateWer": 0,
    "threshold": 0.1,
    "qaFailed": false,
    "mode": "full",
    "sampledCount": 1,
    "sttHealth3855": "available:true",
    "sttHealth3847": "available:false",
    "job3847Qa": "mode:off aggregateWer:null No QA data",
    "deliberateBreakTests": "14 passed (wer + deliberate-break)"
  },
  "runtimeMs": 3030
}
```
