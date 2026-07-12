# Phase 1 Report — Landscape Verification

**Date:** 2026-07-12  
**Branch:** main  
**Scope:** Research only — no engine integration.

## Build / test / lint

```
npm run build  → clean (nest build OK)
npm test       → deferred to Phase 2 (no src changes this phase)
npx eslint     → N/A (docs only)
```

## Deliverables

- `EXPRESSIVE_LANDSCAPE.md` — verified table for 8 engines, licenses pasted from live sources, hard disqualifications, 6 bench advancers, non-goals.

## Key decisions

| Decision | Rationale |
|----------|-----------|
| Disqualify **F5-TTS** from shipping | Weights **CC-BY-NC-4.0** on HF (verified cardData) |
| Disqualify **StyleTTS2** from shipping | Custom weight consent terms + GPL phonemizer risk |
| Advance 6: Chatterbox, Orpheus, Dia, CosyVoice2, Qwen3-TTS, Kokoro floor | All have commercial-OK code+weights (Apache-2.0 or MIT) |
| pt-BR: Chatterbox dedicated pack + Qwen3 Portuguese listed | To be measured honestly in Phase 3/11 |

## Self-review Pass A (correctness)

- License strings match curl of LICENSE files / HF API on 2026-07-12.
- No integration code touched.
- Kokoro correctly marked as incumbent floor, not a “win” candidate.

## Self-review Pass B — 3 adversarial weaknesses

1. **EXPRESSIVE_LANDSCAPE.md / CosyVoice row / failure:** CosyVoice ecosystem historically mixed model trees; a sub-package could still pull non-Apache assets. **Mitigation:** Phase 3 license check on *downloaded* artifacts, not just HF API.
2. **EXPRESSIVE_LANDSCAPE.md / Qwen3 row / failure:** Apple Silicon path unverified; if only CUDA works, RTF may be unusable offline on this Mac. **Mitigation:** Phase 3 real RTF on M4 Max; kill if install fails.
3. **EXPRESSIVE_LANDSCAPE.md / Chatterbox Turbo tags / failure:** Tags may be Turbo-only while Multilingual V3 lacks them — product could over-promise. **Mitigation:** Phase 3 control probe documents which variant supports which tags.

## Audio smoke

N/A — research phase.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| ws-p1-web | GitHub/HF license verification (8 engines) | landed | ~3 min |
| ws-p1-build | `npm run build` baseline | landed clean | ~15 s |
| subagents | none this phase | n/a | — |

## Orphans

None.

## Commit plan

`docs(voice): Phase 1 expressive TTS landscape verification`
