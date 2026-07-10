# Phase 06 — QA Round-Trip Loop (WER)

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/qa/wer.ts` | DP WER (S+D+I)/N without heavy deps |
| `src/tts/qa/normalize.ts` | TTS-aware normalization (Dr./numbers) |
| `src/tts/qa/synthesis-qa.service.ts` | qaChunk, sample/full modes, single retry |
| `src/tts/qa/*.spec.ts` | Hand-computed WER + sampling tests |
| `src/tts/tts.service.ts` | Per-chunk QA hook + metadata.qa + rerunQa |
| `src/tts/tts.controller.ts` | GET /tts/jobs/:id/qa, POST …/qa/rerun, qa DTO |
| `scripts/qa-run.js` | qa:sample / qa:all CLI |
| `package.json` | qa:sample, qa:all scripts |

## Commands (real output)

### Unit tests (WER)
```
Tests: 163 passed (includes wer + synthesis-qa + normalize cases)
```

### Build
```
> nest build
```
Exit 0

### Real STT foundation (from Phase 5)
```
REAL_WHISPER text matches quick-sentence; elapsedMs=740
```

## Adversarial self-review (Pass B)

1. **Finding:** Default QA mode is `sample` when whisper available — long jobs only score every 3rd chunk; silent failure on unscored chunks still possible.  
   **Resolution:** By design (cost control). Final verification uses qa:full / qa:all. Documented in API.

2. **Finding:** `normalizeForWer` digit expansion is English-centric; pt-BR number words not mapped.  
   **Resolution:** Acceptable for G27 EN QA gate; pt-BR QA can extend NUMBER_WORDS later.

3. **Finding:** Retry re-synth uses same voice/settings — if failure is systematic (bad dict), retry cannot help.  
   **Resolution:** Intentional single retry cap; qaFailed flag surfaces for human review.

## Self-review Pass A

Threshold 0.10, one retry max, aggregate weighted by ref tokens, empty aggregate safe.
