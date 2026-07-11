# Phase 6 — Boundary-aware assembly

## Changes
- `assemble-with-pauses.ts`: forced → crossfade only; else profile silence
- Entering header: **only** pre-header (or chapter for H1) — no double-stack
- Leaving header: header/chapter band
- Dialogue path uses profile dialogue/travessão (not flat 0.2s)
- Delta-only sentence insert when piper already emitted sentence_silence
- `tts.service.assembleWithPauseMap` one concat pass

## Before → after (piper audiobook)

| fixture | baseline conf | after conf | para ms |
|---|---:|---:|---:|
| en-punctuation | 28.6% | **100%** | 65 → **850** |
| en-structure | 3.6% | **100%** | 201 → header **1100** / chapter **2000** |
| pt-br-pontuacao | 0% | **≥96%** | 71 → **~850** |
| pt-br-estrutura | ~4% | **100%** | → header/chapter in band |

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| assembly unit tests | para/forced/ssml/delta | green |
| re-probe after double-gap fix | structural 100% | landed |

## Adversarial findings
1. Pre-header+header at same join → 1.4s continuous silence mis-scored — approach-only fix.
2. Dialogue OR next-line used dialogue gap for narrative resume — require AND for dialogue-dialogue.
3. Forced crossfade marker could duplicate audio in flat plan — filter crossfade-pair from concat.

## Review loop
Build + full test suite; probe structural 100%.
