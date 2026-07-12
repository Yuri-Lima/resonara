# Resonara Release Qualification Report

> Status: **IN PROGRESS** — catalog measured; matrix/soak/packaging pending

## Methodology

1. Corpus — seed 42 bilingual catalog + 50k soak novel.
2. Catalog render — 24 jobs piper×audiobook via render-farm (COMPLETE).
3. Measurement — farm-measure.js (WER proxy / pause / RTF / valid audio).
4. Matrix — 6 docs × available engines × 3 profiles (in flight).
5. Gate — FARM_ARCHITECTURE thresholds.
6. Soak — novel-length RSS plateau.
7. Packaging — macOS DMG smoke + Windows NSIS build-verify.

## Catalog quality table

| Aggregate | Value |
|---|---|
| total | 24 |
| measured | 24 |
| failed | 0 |
| mean WER | 0.1033 |
| mean pause conformance | 100.0% |
| mean RTF | 0.346 |
| invalid audio | 0 |

| Document | Engine | Lang | WER | Conf | RTF | Gate |
|---|---|---|---|---|---|---|
| en-short-article | piper | en | 0.044 | 100% | 0.29 | GO |
| en-news | piper | en | 0.095 | 100% | 0.24 | GO |
| en-book-chapter | piper | en | 0.036 | 100% | 0.40 | GO |
| en-technical-doc | piper | en | 0.163 | 100% | 0.36 | GO |
| en-dialogue-script | piper | en | 0.214 | 100% | 0.46 | GO |
| en-ssml-showcase | piper | en | 0.114 | 100% | 0.45 | GO |
| en-children-story | piper | en | 0.061 | 100% | 0.32 | GO |
| en-numbers-and-dates | piper | en | 0.244 | 100% | 0.35 | GO |
| en-pronunciation-challenge | piper | en | 0.036 | 100% | 0.38 | GO |
| en-long-essay | piper | en | 0.051 | 100% | 0.36 | GO |
| en-paragraph | piper | en | 0.084 | 100% | 0.40 | GO |
| en-quick-sentence | piper | en | 0.130 | 100% | 0.40 | GO |
| en-news-expanded | piper | en | 0.036 | 100% | 0.28 | GO |
| pt-artigo | piper | pt-BR | 0.023 | 100% | 0.35 | GO |
| pt-noticia | piper | pt-BR | 0.119 | 100% | 0.33 | GO |
| pt-capitulo | piper | pt-BR | 0.161 | 100% | 0.11 | GO |
| pt-dialogo | piper | pt-BR | 0.205 | 100% | 0.42 | GO |
| pt-numeros | piper | pt-BR | 0.235 | 100% | 0.36 | GO |
| pt-tecnico | piper | pt-BR | 0.019 | 100% | 0.28 | GO |
| pt-pronuncia | piper | pt-BR | 0.124 | 100% | 0.55 | GO |
| pt-ssml | piper | pt-BR | 0.009 | 100% | 0.44 | GO |
| pt-historia | piper | pt-BR | 0.183 | 100% | 0.07 | GO |
| pt-ensaio | piper | pt-BR | 0.050 | 100% | 0.29 | GO |
| pt-paragrafo | piper | pt-BR | 0.044 | 100% | 0.42 | GO |

## Engine × profile matrix

_Pending matrix completion._

## Soak stability

_Pending Phase 10._

## Packaging

_Pending Phase 11._

## Verdict

**PENDING** — matrix, soak, packaging not complete. Catalog gates look healthy (mean WER 0.10, conf 100%, 0 invalid).
