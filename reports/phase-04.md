# Phase 04 — Preprocessing A/B Listening Verification

**Date:** 2026-07-11

## Fixture

`samples/texts/messy-extract.txt` — page numbers, running header ACME RESEARCH QUARTERLY, footnotes [1][2], citations, URL, ALL-CAPS headings.

## Preprocess preview (documentMode=true)

```
cleaned chars 641 orig 786 removals 14
 - headers 'ACME RESEARCH QUARTERLY'
 - pageNumbers '14' / 'Page 15' / '16'
 - footnotes '[1]' '[2]'
 - citations '(Smith et al., 2023)' '(Jones, 2021)'
 - urls 'https://github.com/acme/market-dynamics' → spoken
 - allCapsHeadings title-cased
```

Artifact checks after clean: Page 14 / ACME RESEARCH / [1] / Smith et al / https:// → **all absent**.

## Synthesis

```
messy-off job 64a7d056… completed speech.wav
messy-on  job 7d5784b4… completed
```

## Clean demo false-positive check

`npm run demo:paragraph` (Phase 2) green — preprocessor defaults OFF for raw paste.

## Adversarial self-review (Pass B)

1. **Finding:** pageNumbers rule strips standalone `14` lines — could remove intentional single-number lines in poetry.  
   **Resolution:** Document mode only; raw paste defaults OFF.

2. **Finding:** headers rule needs 3+ identical lines — 2-repeat headers survive.  
   **Resolution:** Acceptable precision/recall tradeoff; 3+ is classic PDF artifact.

3. **Finding:** URL spoken form may still sound awkward for long paths.  
   **Resolution:** Configurable urls: spoken|stripped|verbatim.

## Self-review Pass A

14 unit tests green including [narrator] preservation and idempotency.
