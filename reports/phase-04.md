# Phase 4 — Chunker boundary metadata

## Changes
- `text-chunker.ts` emits `pause: { endsAt, intraBoundaries, isHeader, headerLevel }`
- Never pack across paragraph/header/chapter/dialogue
- Drop pure `---` HR separators (chapter marker, not speech)
- Header detection: markdown `#`/`##`/`###` + Title Case heuristics
- pt-BR travessão dialogue → `endsAt: 'dialogue'`

## Tests
`boundary-detect.spec.ts`, chunker regression coverage in pause suite.

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| chunker tests | en+pt-BR classification | landed |

## Adversarial findings
1. Packing short paragraphs re-introduced flat joins — disabled pack across structural.
2. Header+body forced into one chunk loses header→body gap — keep standalone header pieces.
3. HR `---` as empty speech triple-stacked chapter gaps — filter HRs out.

## Review loop
Build + pause tests green after chunker changes.
