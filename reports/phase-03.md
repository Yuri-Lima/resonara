# Phase 03 — Text Preprocessing Pipeline

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/text-preprocessor.ts` | Configurable rules: page numbers, headers, footnotes, citations, URLs, dashes, ALL-CAPS, whitespace |
| `src/tts/text-preprocessor.spec.ts` | Isolation + combined + [narrator] + idempotency tests |
| `src/tts/tts.service.ts` | `previewPreprocess`, startLongForm optional prep, startFromDocument document defaults ON |
| `src/tts/tts.controller.ts` | `POST /tts/preprocess-preview`; synthesize/import wiring |

## Commands run (real output)

### Tests (preprocessor)
```
Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
```

### Full suite
```
Test Suites: 31 passed, 31 total
Tests:       147 passed, 147 total
```

### Build
```
> nest build
```
Exit 0

### Lint (touched files)
Clean (0 problems on text-preprocessor + controller + service)

### demo:quick
```
"words": 16,
"realTimeFactor": 1.9750447019867552
```

## Adversarial self-review (Pass B)

1. **Finding:** `stripFootnoteMarkers` initially treated `[a]` as a dialogue tag via `DIALOGUE_TAG_RE` requiring only 1+ chars after first letter — test failed: `[a]` preserved.  
   **Resolution:** FIXED — dialogue tags now require ≥2 chars in the name (`[a-zA-Z][a-zA-Z0-9_\- ]{1,40}`), so `[a]` is a footnote and `[narrator]` is preserved.

2. **Finding:** `startFromDocument` cleans chapters then passes `preprocessing.enabled: false` into `startLongForm` — if a future caller expects `metadata.preprocessing` to record that document mode ran, it is not persisted.  
   **Resolution:** Acceptable for Phase 3; removals are available via preprocess-preview. Metadata persistence can land with QA metadata (Phase 6) if needed.

3. **Finding:** Header detection uses exact `trim()` equality — headers that differ by trailing spaces or soft hyphens across PDF pages would miss the 3+ threshold.  
   **Resolution:** Acceptable; classic PDF extractors usually emit identical running headers. Documented as known limitation; can normalize NBSP later.

## Self-review Pass A

Type-safe rules; empty input handled; double-process avoided on document path; raw paste defaults OFF; build/test green; demo smoke OK.

## Metrics

| Metric | Value |
|--------|-------|
| New tests | +14 (147 total) |
| Baseline tests | 133 |
