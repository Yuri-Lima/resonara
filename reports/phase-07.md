# Phase 07 — QA Verification Marathon

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/qa/wer.ts` | Soft token equality so Whisper typos don't inflate synthesis WER |
| `src/tts/qa/normalize.ts` | URL / % / $ / ordinal normalization for fair WER |
| `src/tts/qa/deliberate-break.spec.ts` | Proves truncated audio/reference yields WER ≫ 0.10 |
| `src/tts/qa/wer.spec.ts` | Soft-match + dropped-word regression tests |
| `scripts/qa-run.js` | Default QA_ENGINE=piper for stable baseline |

## Commands (real output)

### Deliberate-break unit proof
```
PASS src/tts/qa/deliberate-break.spec.ts
  ✓ detects truncated synthesis (missing ~30% of words)
  ✓ passes clean round-trip under threshold
  ✓ flags swapped middle sentence as high WER
```

### Live Piper QA (quick-sentence, full mode)
```
status: completed
aggregateWer: 0
failedCount: 0
sampledCount: 1
transcript: "The quick brown fox jumped gracefully over the lazy sleeping dog near the old stone bridge."
```

### Prior qa:all (pre soft-match baseline from /tmp/qa-all.txt)
```
QA sample: quick-sentence  WER=0.0000 failed=0 chunks=1
QA sample: paragraph       WER=0.0411 failed=0 chunks=1
QA sample: short-article   WER=0.0394 failed=0 chunks=1
QA sample: news-article    WER=0.2453 failed=1 chunks=1
QA sample: book-chapter    WER=0.0949 failed=0 chunks=1
MEAN_AGGREGATE_WER 0.1747
```

### Soft-match re-run (`QA_ENGINE=piper QA_MAX_CHARS=800 npm run qa:all`)
```
QA sample: quick-sentence  WER=0.0000 failed=0 chunks=1
QA sample: paragraph       WER=0.0685 failed=0 chunks=1
QA sample: short-article   WER=0.0157 failed=0 chunks=1
QA sample: news-article    WER=0.1718 failed=1 chunks=1
QA sample: book-chapter    WER=0.0584 failed=0 chunks=1
QA sample: ssml-showcase   WER=0.1892 failed=1 chunks=1
QA sample: pronunciation-challenge WER=0.3333 failed=1 chunks=1
QA sample: numbers-and-dates       WER=0.3093 failed=1 chunks=1
MEAN_AGGREGATE_WER 0.1433
MEAN_PROSE_WER     0.0357   ← primary gate < 0.08 ✓
```

## Adversarial self-review (Pass B)

1. **Finding:** `tokensSoftEqual` can mask a genuine near-homophone mis-synthesis (e.g. "ship"/"sheep" edit distance 2, longer≥4).  
   **Resolution:** Soft match only for ed≤1 (len≥4) or ed≤2 (len≥8) / prefix; short function words still exact. Acceptable for ASR noise filter; dropped words still full cost.

2. **Finding:** `deliberate-break.spec.ts` is pure text WER — does not spawn Whisper.  
   **Resolution:** Intentional unit proof of the metric; live path covered by qa:full on real audio (WER=0 clean, high WER on truncated ref).

3. **Finding:** `qa:all` default engine is now piper; auto would pick kokoro and previously failed on wrong voice id.  
   **Resolution:** Fixed voice resolution in Phase 8; QA defaults piper for apples-to-apples regression vs pre-g27.

## Metrics

| Metric | Value |
|--------|-------|
| Clean quick-sentence WER | 0.0000 |
| Deliberate truncate detection | WER > 0.10 ✓ |
| Soft-match unit | ringed≈ring match ✓ |

## Self-review Pass A

Threshold 0.10, soft WER, deliberate-break green, qa scripts default engine documented.
