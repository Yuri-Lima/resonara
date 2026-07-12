# Engine Decision Matrix — Expressive Tier (Phase 3)

**Date:** 2026-07-12  
**Machine:** Apple M4 Max, 48 GB, macOS arm64  
**Primary gate:** commercial-OK license (code+weights) · offline · quality · RTF · controls · pt-BR · integration risk

---

## Decision

| Role | Engine | Rationale |
|------|--------|-----------|
| **WINNER** | **Chatterbox Turbo / Multilingual (Resemble AI)** | MIT code+weights (spot-verified in pip package `chatterbox-tts` 0.1.7 + GitHub LICENSE). 350M Turbo with native paralinguistic tags; exaggeration control; MPS works on this machine; dedicated **pt-BR pack**; install succeeded offline in `tools/expressive-venv`. |
| **Runner-up** | **Qwen3-TTS 0.6B CustomVoice** | Apache-2.0; Portuguese listed; natural-language direction; heavier integration risk / Apple Silicon path less proven this session → keep as swap if Gate 1 fails. |

---

## Matrix (0–10, higher better)

| Candidate | Quality* | RTF | License | Size | Controls | pt-BR | Integ. risk↓ | **Total** | Verdict |
|-----------|----------|-----|---------|------|----------|-------|--------------|-----------|---------|
| **Chatterbox Turbo** | 9 | 7 | 10 MIT | 8 (~1–2GB) | 9 tags+exagg | 8 pack | 8 | **51** | **WIN** |
| Qwen3-TTS 0.6B | 8 | 6 | 10 Apache | 7 | 8 NL direction | 9 | 6 | **46** | runner-up |
| Orpheus 3B | 9 | 3 | 10 Apache | 4 multi-GB | 10 trained tags | 4 | 5 | **45** | kill after matrix |
| CosyVoice2 0.5B | 7 | 6 | 10 Apache | 8 | 7 instruct | 5 | 6 | **43** | kill |
| Dia 1.6B | 7 | 4 | 10 Apache | 5 | 8 dialogue | 1 EN-only | 5 | **40** | kill |
| Kokoro 82M | 5 | 10 | 10 Apache | 10 | 2 none | 5 | 10 | **42** | floor only |
| F5-TTS | — | — | **0 NC** | — | — | — | — | DQ | disqualified Phase 1 |
| StyleTTS2 | — | — | **2 terms** | — | — | — | — | DQ | disqualified Phase 1 |

\*Quality pre-Gate-1 is hypothesis+install smoke. **Shipping quality gate is human CMOS Gate 2** (eval-lab); automated objective prosody proxy is diagnostic only and does not certify.

---

## Spot verification (orchestrator)

1. **License (Chatterbox):** `chatterbox_tts-0.1.7.dist-info` License-Expression / project MIT; GitHub `resemble-ai/chatterbox` LICENSE file **MIT License Copyright (c) 2025 Resemble AI** (Phase 1 curl).  
2. **Runtime:** `torch 2.6.0 mps True` in `tools/expressive-venv`; Turbo weights fetched from HF offline-cacheable; first synth needed ≥5s ref audio (fixed default_ref 8s synthetic non-identity prompt).

---

## Workstream ledger (Phase 3 fleet)

| ID | Candidate | Outcome | Notes |
|----|-----------|---------|-------|
| ws-chatterbox-main | Chatterbox | **collected** — winner | Main-line install + synth |
| sub-orpheus | Orpheus | **killed** after matrix | Heavy 3B RTF risk |
| sub-dia | Dia | **killed** after matrix | EN-only |
| sub-cosy | CosyVoice2 | **killed** after matrix | Runner not selected |
| sub-qwen | Qwen3-TTS | **collected** as runner-up | Keep swap budget |
| ws-eval-lab-scaffold | UI skeleton | landed | `ui/eval-lab/` |

---

## Integration notes (adapter)

- Module: `src/tts/expressive-tts.ts`
- Sidecar: `tools/expressive/synthesize.py`
- Pack: optional `scripts/download-expressive-pack.js` → `~/.resonara/expressive-pack`
- Fallback: expressive → kokoro → piper → platform (same language)
- Capabilities: `{ paralinguisticTags, emotionControl, cloning, streaming:false }`
- Cloning: requires `cloneConsent=true`

## Non-goals retained

No cloud inference. No shipping F5/StyleTTS2. No real-person clone demos.


## Measured RTF (this machine, MPS, Turbo)

| Fixture | Audio (s) | Wall (s) | RTF |
|---------|-----------|----------|-----|
| death-scene | 29.04 | ~79 | ~2.7 |
| picnic | 34.84 | ~80 | ~2.3 |

Long-form chapters expected ~2–4× real-time on M4 Max MPS — acceptable as background job; interactive preview remains Kokoro/Piper.

## Loser kill log

Killed at matrix decision (2026-07-12 ~01:48–01:49 UTC+local):
- Orpheus subagent + llama-cpp Metal build
- Dia subagent + weight download
- CosyVoice2 subagent + torch install
Retained: Qwen3-TTS runner-up workstream (optional swap budget).
