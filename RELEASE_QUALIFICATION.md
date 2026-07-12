# Resonara Release Qualification Report

> Status: **IN PROGRESS** (skeleton — filled as farm batches complete)

## Methodology

1. **Corpus** — seed-deterministic bilingual catalog (`samples/catalog/`, seed 42) with ≥24 documents and a 50k-word soak novel.
2. **Catalog render** — each non-soak doc × best-fit engine × language × audiobook profile via `scripts/render-farm.js`.
3. **Measurement** — `scripts/farm-measure.js` aggregates WER, pause conformance, RTF, audio validity.
4. **Matrix** — representative docs × available engines × {audiobook, podcast, news}.
5. **Gate** — thresholds from `FARM_ARCHITECTURE.md`.
6. **Soak** — novel-length stability with RSS plateau proof.
7. **Packaging** — macOS DMG runtime smoke + Windows NSIS build-verify.

## Catalog quality table

_Pending catalog measurement (Phase 6)._

## Engine × profile matrix

_Pending matrix render + measure (Phase 7)._

## Soak stability

_Pending Phase 10._

## Packaging

_Pending Phase 11._

## Verdict

**PENDING** — not enough measured data yet.
