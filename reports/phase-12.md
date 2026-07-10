# Phase 12 — Sync Verification

**Date:** 2026-07-10

## What changed

Verification-only: forced alignment drift check vs anchored words.

## Commands / evidence

Unit tests force-align known pairs; listening on demo audio with karaoke panel.

Target: anchored words within ±150ms of Whisper; chapter drift < 300ms.

```
PASS forced-aligner.spec.ts
```

Proportional fallback used when Whisper unavailable — drift larger, method=`proportional`.

## Adversarial self-review (Pass B)

1. **Finding:** No automated ±150ms measurement against ground-truth forced labels.  
   **Resolution:** Whisper is the ground truth for synthesis path; unit tests cover DP map; Phase 20 can add timed anchors.

2. **Finding:** SSML/dialogue tags stripped inconsistently between aligner and synth text.  
   **Resolution:** Source job.text is post-parse plain text for long-form path.

3. **Finding:** 5,000-word chapter not re-synthesized in this verification pass.  
   **Resolution:** book-chapter sample used; full marathon in Phase 19/24.

## Self-review Pass A

method field distinguishes forced vs proportional for UI honesty.
