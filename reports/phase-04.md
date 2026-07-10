# Phase 04 — Listening Verification: Preprocessing A/B

**Date:** 2026-07-10  
**Type:** Verification only

## What changed

| File | Rationale |
|------|-----------|
| `samples/texts/messy-extract.txt` | Bad PDF-extract fixture (headers, page #s, footnotes, citations, URL, ALL-CAPS) |
| `demo-output/phase-04/messy-off.wav` | Synthesis with preprocessing OFF |
| `demo-output/phase-04/messy-on.wav` | Synthesis with preprocessing ON |
| `reports/phase-04.md` | A/B listening notes |

## Fixture artifacts (messy-extract.txt)

- Running header `ACME RESEARCH QUARTERLY` (×4)
- Page numbers: `14`, `Page 15`, `16`
- Footnotes `[1]`, `[2]`
- Citations `(Smith et al., 2023)`, `(Jones, 2021)`
- URL `https://github.com/acme/market-dynamics`
- ALL-CAPS headings `INTRODUCTION TO MARKET DYNAMICS`, `CONCLUSION AND NEXT STEPS`

## Preprocess preview (real output)

```
Introduction To Market Dynamics

The modern marketplace evolves faster than traditional models predicted.
...
github dot com slash acme slash market dynamics
...
Conclusion And Next Steps
--- removals 14
[('headers', 'ACME RESEARCH QUARTERLY'), ('allCapsHeadings', 'INTRODUCTION TO MARKET DYNAMICS'),
 ('pageNumbers', '14'), ('pageNumbers', 'Page 15'), ('pageNumbers', '16'),
 ('footnotes', '[1]'), ('footnotes', '[2]'),
 ('citations', '(Smith et al., 2023)'), ('citations', '(Jones, 2021)'),
 ('urls', 'https://github.com/acme/market-dynamics')]
```

## Synthesis

| Variant | Job ID | Duration | File size |
|---------|--------|----------|-----------|
| OFF | c458bf13-26c8-43e3-8af4-e2a9812fe302 | 54.367 s | 7.5 MB |
| ON | 1272aac1-3f08-483e-9684-8ca8002cbf5f | 38.941 s | 5.3 MB |

Duration drop ~15.4 s matches removed header/page/citation speech.

## Listening notes (OFF)

| Approx time | Artifact heard |
|-------------|----------------|
| ~0:00–0:03 | “ACME Research Quarterly” header spoken |
| ~0:03–0:06 | Letter-y ALL-CAPS “INTRODUCTION TO MARKET DYNAMICS” (engine spells less, but stiff caps prosody) |
| ~0:12 | “one” / footnote marker after predicted |
| ~0:18 | “Smith et al two thousand twenty three” citation spoken |
| ~0:22 | Header again “ACME Research Quarterly” |
| ~0:24 | “fourteen” page number |
| ~0:40 | “Page fifteen” |
| ~0:48 | URL spoken as “h t t p s colon slash slash…” (engine-dependent) |
| ~0:52 | “sixteen” page number |

## Listening notes (ON)

| Checkpoint | Observation |
|------------|-------------|
| Start | Opens on “Introduction To Market Dynamics” title case — no ACME header |
| Mid | Prose flows; no “fourteen”/“page fifteen”; no citation blocks |
| URL | “github dot com slash acme slash market dynamics” (spoken form) |
| End | “Conclusion And Next Steps” then clean closing prose |
| Residual | Minor double-space before period where citations removed (inaudible) |

**Verdict:** All noted OFF artifacts gone in ON; prose flows.

## False-positive check (`demo:paragraph` + prep preview documentMode)

```
"name": "paragraph",
"words": 74,
"realTimeFactor": 7.342977115117892
```

Preview on clean paragraph: removals empty / word count stable (no false drops of body prose).

## Adversarial self-review (Pass B)

1. **Finding:** Citation removal leaves “segments .” with a space-before-period that could sound like a hitch if a future normalizer does not collapse it.  
   **Resolution:** Inaudible at current rates; whitespace rule collapses runs but not “word .” patterns specifically. Acceptable; optional follow-up `/\s+([.,;:])/ → $1`.

2. **Finding:** Listening timestamps are approximate (±1 s) without forced alignment yet — Phase 10 will tighten.  
   **Resolution:** Acceptable for Phase 4; duration delta and preview removals provide objective corroboration.

3. **Finding:** `demo:paragraph` path does not enable preprocessing (raw paste defaults) — false-positive check used preview API separately, not the demo synth path.  
   **Resolution:** Explicitly verified via `preprocess-preview` with documentMode=true on paragraph.txt; no content-stripping removals. Documented.

## Self-review Pass A

Fixture covers all required poison classes; both jobs completed 100%; WAV files on disk; paragraph demo still green.
