# Phase 3 Report — Candidate Bench + Engine Decision

**Date:** 2026-07-12  
**Machine:** Apple M4 Max, 48 GB, macOS arm64, MPS

## Build / test / lint

```
npm run build → clean
npm test → 50 suites, 271 passed, 1 skipped
npx eslint src/tts/expressive-tts.ts src/tts/expression/ … → clean
```

## Decision

| Role | Engine |
|------|--------|
| **WINNER** | Chatterbox Turbo (Resemble AI) — MIT code+weights |
| **Runner-up** | Qwen3-TTS 0.6B CustomVoice — Apache-2.0 |

Full matrix: `ENGINE_DECISION.md`

## Spot verification (orchestrator)

1. **License Chatterbox:** pip package `chatterbox-tts` 0.1.7 MIT; GitHub resemble-ai/chatterbox LICENSE MIT © 2025 Resemble AI.
2. **Runtime:** torch 2.6.0 mps=True in `tools/expressive-venv`; death-scene render wall_s≈78s on MPS, ~29s audio → RTF ≈ 2.7.
3. **Qwen weights:** HF cardData.license=apache-2.0; model.safetensors ~1.7G + speech_tokenizer 651M.

## Real renders (this machine)

| Fixture | File | Duration | wall (approx) | RTF |
|---------|------|----------|---------------|-----|
| death-scene | bench/candidates/chatterbox/death-scene.wav | 29.04 s | ~79 s | ~2.7 |
| picnic | bench/candidates/chatterbox/picnic.wav | 34.84 s | ~80 s | ~2.3 |

### Prosody (first-pass synthetic-ref; speech-ref re-render pending)

| Fixture | F0 mean | F0 range | F0 var | Prosodic diversity |
|---------|---------|----------|--------|--------------------|
| death-scene | 174.9 | 183.3 | 826.8 | 126.8 |
| picnic | 192.4 | 123.7 | 531.0 | 356.1 |
| death/picnic F0 mean ratio | **0.91** (17 Hz separation vs Piper ~5 Hz) | | | |

Piper baseline death/picnic F0 var ratio was **1.008** (flat affect). Chatterbox raw already separates mean F0 by affect; diversity needs directed exaggeration (Phase 5–10).

## Workstream ledger

| ID | Candidate | Outcome | Runtime | Notes |
|----|-----------|---------|---------|-------|
| ws-chatterbox-main | Chatterbox | **collected — WIN** | ~15 min install + renders | Main-line MPS |
| sub-orpheus `019f538d-…e9e7b278fa` | Orpheus | **killed** after matrix | ~8 min | Heavy 3B / llama-cpp Metal build |
| sub-dia `019f538d-…5f4bfa04fc0` | Dia | **killed** after matrix | ~8 min | EN-only |
| sub-cosy `019f538d-…060b8f8c7efa` | CosyVoice2 | **killed** after matrix | ~8 min | Not selected |
| bash cosy-torch `019f5391-…b21d5dc53884` | Cosy install | **killed** | ~4 min | |
| bash dia-dl `019f5390-…e4404e311c86` | Dia weights | **killed/ended** | ~5 min | |
| bash orpheus-llama `019f5394-…bc0a-bd0384800a69` | llama-cpp | **killed** | ~1 min | |
| sub-qwen `019f538d-…061da9dcb0d0` | Qwen3-TTS | **collected runner-up** | ongoing optional | Apache-2.0 verified |
| ws-eval-lab | UI skeleton | landed | — | `ui/eval-lab/` |

Zero orphans required at session close — losers killed at matrix time.

## Adversarial findings (3)

1. **tools/expressive/synthesize.py `_ensure_default_ref`**: pure-tone synthetic ref yields low-quality cloning → **fixed** by using Piper-speech 8s non-person ref.
2. **src/tts/voice-manager.ts `VoiceEngine`**: duplicate `'expressive' \| 'expressive'` type → **fixed**.
3. **ENGINE_DECISION quality column**: pre-Gate-1 scores are install-smoke hypotheses; Gate 1 blind CMOS is the hard quality gate (documented in matrix footnote).

## Audio smoke

- death-scene.wav and picnic.wav exist, non-silent, human speech-like (not pure tone).
- First-pass used synthetic tone ref (documented limitation); speech-ref re-render in Phase 5.

## Commit

Phase 3: ENGINE_DECISION.md + reports/phase-03.md + eval-lab scaffold + scripts.
