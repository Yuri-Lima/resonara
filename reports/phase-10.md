# Phase 10 — Forced Alignment

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/alignment/forced-aligner.ts` | Needleman–Wunsch map Whisper words → source; interpolate gaps |
| `src/tts/alignment/forced-aligner.spec.ts` | Anchored + interpolated unit tests |
| `src/tts/tts.service.ts` getSubtitles | Prefer Whisper base forced align; cache wordTimestamps |

## Commands (real output)

```
PASS src/tts/alignment/forced-aligner.spec.ts
npm test → 187+ passed including forced-aligner
npm run build → exit 0
```

## Adversarial self-review (Pass B)

1. **Finding:** Substitution still anchors time (`map[i-1]=j-1` even on mismatch) which can drift on heavy ASR error.  
   **Resolution:** Acceptable; interpolation between good anchors; method field exposes `forced` vs `proportional`.

2. **Finding:** Full-file Whisper base on long audiobooks is O(duration) and can hit 180s timeout.  
   **Resolution:** Timeout 180s; falls back to proportional estimate on failure (logged).

3. **Finding:** `normToken` joins multi-token normalizeForWer into one string — rare multi-word expansions may mis-align.  
   **Resolution:** Acceptable for word-level alignment; numbers still roughly time-aligned.

## Self-review Pass A

Empty source → []; empty whisper → interpolated zeros; mergeChunkAlignments offsets; wordIndexAtTime binary search.
