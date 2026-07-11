# Expressive TTS Landscape — Verified 2026-07-12

**Machine:** Apple M4 Max, arm64, 48 GB RAM, macOS  
**Product constraint:** Resonara is MIT; engine code **and** weights must permit commercial redistribution. Offline inference only (CPU / Apple Silicon). No cloud TTS.

The landscape table below is **evidence**, not the prompt’s hypothesis list. Every license claim was checked against the live GitHub LICENSE file and/or Hugging Face `cardData.license` on this date.

---

## 1. Verified candidate table

| # | Engine | Repo / model card | Code license | Weights license | Params | Quant / ONNX / GGUF | Device paths | Languages (pt-BR) | Expression controls | Ship? | Bench? |
|---|--------|-------------------|--------------|-----------------|--------|---------------------|--------------|-------------------|---------------------|-------|--------|
| 1 | **Chatterbox / Turbo / Multilingual V3** | [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) · [ResembleAI/chatterbox-turbo](https://huggingface.co/ResembleAI/chatterbox-turbo) | **MIT** (repo LICENSE, Copyright 2025 Resemble AI) | **MIT** (HF `license:mit`) | Turbo **350M**; Multilingual/Original **500M** | PyTorch; no official GGUF; MPS/CUDA/CPU | `device="mps"\|"cpu"\|"cuda"` in API | **23+** incl. Portuguese; **dedicated pt-BR pack** `Chatterbox-Multilingual-pt-br` | Turbo: `[laugh]` `[chuckle]` `[cough]`…; original: `exaggeration` + `cfg_weight`; zero-shot ref audio; PerTh watermark | **YES** | **YES** |
| 2 | **Orpheus** | [canopyai/Orpheus-TTS](https://github.com/canopyai/Orpheus-TTS) · [canopylabs/orpheus-3b-0.1-ft](https://huggingface.co/canopylabs/orpheus-3b-0.1-ft) | **Apache-2.0** | **Apache-2.0** (HF) | **~3B** (Llama-3.2-3B backbone) | Community **GGUF** (e.g. unsloth); SNAC codec | CUDA primary; CPU/MPS via transformers/llama.cpp forks | EN primary; multilingual research preview (pt not first-class) | **Trained tags:** `<laugh>` `<chuckle>` `<sigh>` `<cough>` `<sniffle>` `<groan>` `<yawn>` `<gasp>`; voice names (tara, leo, …) | **YES** (heavy) | **YES** |
| 3 | **Dia** | [nari-labs/dia](https://github.com/nari-labs/dia) · [nari-labs/Dia-1.6B](https://huggingface.co/nari-labs/Dia-1.6B) | **Apache-2.0** | **Apache-2.0** (HF) | **1.6B** | PyTorch safetensors (~6GB class) | CUDA preferred; CPU possible slow | **EN only** (README) | Dialogue `[S1]`/`[S2]`; non-verbal tags e.g. `(laughs)` (inventory broad, rare tags unstable) | **YES** (EN) | **YES** |
| 4 | **StyleTTS2** | [yl4579/StyleTTS2](https://github.com/yl4579/StyleTTS2) | **MIT** (code) | **Custom consent/attribution terms** on pretrained checkpoints (README §License); not a clean OSI commercial grant for all uses | ~ multi-speaker LibriTTS class | PyTorch; phonemizer often **GPL** (espeak) | CUDA; limited MPS | EN (LJSpeech / LibriTTS) | Style diffusion latent; **no** tag inventory; reference style audio | **NO ship** (weight terms + GPL dep risk) | **YES (reference only)** |
| 5 | **F5-TTS** | [SWivid/F5-TTS](https://github.com/SWivid/F5-TTS) · [SWivid/F5-TTS](https://huggingface.co/SWivid/F5-TTS) | **MIT** (code) | **CC-BY-NC-4.0** (HF `license:cc-by-nc-4.0`) | ~0.3B class (flow matching) | PyTorch | CUDA/CPU | Multilingual via Emilia | Zero-shot clone; no trained paralinguistic tags | **DISQUALIFIED ship** | Reference-only if time |
| 6 | **CosyVoice2** | [FunAudioLLM/CosyVoice](https://github.com/FunAudioLLM/CosyVoice) · [FunAudioLLM/CosyVoice2-0.5B](https://huggingface.co/FunAudioLLM/CosyVoice2-0.5B) | **Apache-2.0** | **Apache-2.0** (HF) | **~0.5B** | PyTorch; ONNX export paths in ecosystem | CUDA; CPU slower | zh/en + multi; pt quality TBD | Instruct/style; streaming ~150ms claimed; zero-shot | **YES** | **YES** |
| 7 | **Qwen3-TTS** | [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) · HF `Qwen/Qwen3-TTS-12Hz-*` | **Apache-2.0** | **Apache-2.0** (HF cardData) | **0.6B / 1.7B** | PyTorch; vLLM path | CUDA primary; Apple Silicon feasibility TBD | **10 langs incl. Portuguese** | Natural-language voice direction; 3s clone; streaming ~97ms claimed; CustomVoice + VoiceDesign | **YES** | **YES** |
| 8 | **Kokoro** (incumbent) | [hexgrad/kokoro](https://github.com/hexgrad/kokoro) · Kokoro-82M ONNX | **Apache-2.0** | Apache-2.0 / model card | **82M** | **ONNX** (already integrated) | CPU excellent | EN + limited multi; pt-BR voices in Resonara pack | Speed/quality floor; **no** emotion tags | **SHIPPED** | Baseline floor |

### Exact license names (paste sources)

| Engine | Code license string | Weights license string | Source checked 2026-07-12 |
|--------|--------------------|------------------------|---------------------------|
| Chatterbox | MIT License | mit | `https://raw.githubusercontent.com/resemble-ai/chatterbox/master/LICENSE`; HF `ResembleAI/chatterbox-turbo` cardData |
| Orpheus | Apache License 2.0 | apache-2.0 | GitHub license API + HF `canopylabs/orpheus-3b-0.1-ft` |
| Dia | Apache License 2.0 | apache-2.0 | GitHub + HF `nari-labs/Dia-1.6B` |
| StyleTTS2 | MIT License | Custom pretrained-model terms (consent + announce synthesized) | README License section |
| F5-TTS | MIT License | **cc-by-nc-4.0** | HF `SWivid/F5-TTS` cardData.license |
| CosyVoice2 | Apache License 2.0 | apache-2.0 | GitHub LICENSE + HF CosyVoice2-0.5B |
| Qwen3-TTS | Apache License 2.0 | apache-2.0 | GitHub + HF Qwen3-TTS-12Hz-0.6B-CustomVoice |
| Kokoro | Apache License 2.0 | apache-2.0 | GitHub hexgrad/kokoro |

---

## 2. Hard-constraint disqualifications (before bench)

| Engine | Constraint failed | Evidence | Disposition |
|--------|-------------------|----------|-------------|
| **F5-TTS** | Weights **CC-BY-NC-4.0** forbid commercial redistribution in an MIT product | HF cardData `license: cc-by-nc-4.0` | **Disqualified from shipping.** May appear in reference notes only; not a Phase-3 fleet member for product selection. |
| **StyleTTS2** (ship path) | Pretrained weights impose consent/attribution terms; best phonemizer path is **GPL** (espeak/phonemizer) contaminating redistribution story | README §License + GPL phonemizer note | **Disqualified from shipping as Engine #4.** Optional reference bench only if fleet has spare capacity. |

Nothing else fails the hard license/offline gate. All advancing engines claim local PyTorch (or ONNX) inference.

---

## 3. Candidates advancing to Phase 3 bench (6)

1. **Chatterbox Turbo** (primary English expressive + tags) + Multilingual/pt-BR pack probe  
2. **Orpheus 3B** (paralinguistic tag gold standard; RTF risk)  
3. **Dia 1.6B** (dialogue-first; EN-only honesty)  
4. **CosyVoice2 0.5B** (streaming + quality; size friendly)  
5. **Qwen3-TTS 0.6B CustomVoice** (pt-BR + instruction control; integration risk)  
6. **Kokoro** (incumbent floor — always measured, not a “win” candidate)

**Runner-up seat:** reserved after matrix (expected contenders: Orpheus if RTF acceptable, else CosyVoice2 / Qwen3).

---

## 4. Session NON-goals

- **No cloud inference** of any candidate (no ElevenLabs, no DashScope-required path for product).
- **No shipping of CC-BY-NC or research-only weights.**
- **Voice cloning of real people for demos/fixtures is FORBIDDEN.** Bench cloning only with synthetic/self-recorded or licensed material; product cloning ships only behind documented consent (Phase 14 ethics gate).
- **No claim of pt-BR parity** until measured; Portuguese is a strong plus, not a hard requirement.
- **No replacement of Piper/Kokoro** for interactive preview; expressive tier is optional long-form / performance path.
- **No removal of pause architecture / WER gates** — expressive tier must compose with them.
- **StyleTTS2 / F5** are not integration targets this session.

---

## 5. Preliminary risk notes (to be measured in Phase 3)

| Engine | Install pain (expected) | RTF risk on M4 Max | Integration risk |
|--------|-------------------------|--------------------|------------------|
| Chatterbox | pip + torch; model download ~1–2 GB | Medium (350–500M) | Medium — Python sidecar like Kokoro |
| Orpheus | 3B weights multi-GB; GGUF helps | **High** | Medium-high |
| Dia | ~6 GB weights | High | Dialogue API differs from monologue adapters |
| CosyVoice2 | Multi-file model tree | Medium | Medium |
| Qwen3-TTS | 0.6–1.7B + tokenizer | Medium-high | New package surface |
| Kokoro | Already installed | Low (floor) | Done |

---

## 6. Hypothesis → evidence deltas

| Prompt claim | Verified? |
|--------------|-----------|
| Chatterbox MIT ~0.5B, emotion exaggeration, cloning, watermark | **Yes** (Turbo 350M; multi 500M; MIT; exaggeration; PerTh; tags on Turbo) |
| Orpheus Apache-2.0 Llama-3B inline tags | **Yes** |
| Dia ~1.6B dialogue EN-only broad tags | **Yes** (EN-only confirmed README) |
| StyleTTS2 best long-form, no tags | Reputation unmeasured here; **no tags** confirmed; **ship blocked** by weight terms |
| F5-TTS MIT code | **Code MIT, weights CC-BY-NC-4.0** — critical correction |
| CosyVoice2 ~0.5B Apache | **Yes** |
| Qwen3-TTS 10 langs incl pt, instruction control | **Yes** (Portuguese listed; Apache-2.0) |
| Kokoro floor | **Yes** — already in Resonara v2.0.0 |

---

*Generated Phase 1 — no engine integration yet. Next: Phase 2 baseline metrics on Piper + Kokoro.*
