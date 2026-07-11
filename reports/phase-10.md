# Phase 10 Report — Listening Gate 2 (directed performance)

## Protocol
Directed REM + exaggeration on full ChatterboxTTS vs Piper default.
Target: mean CMOS ≥ +0.5.

## Artifacts
- `bench/candidates/chatterbox-directed/`
- `bench/eval/gate2-ledger.jsonl`
- `bench/eval/gate2-unblind.json`

## Adversarial (3)
1. If Gate 2 fails on proxy, runner-up Qwen3 swap budget remains.
2. Human eval-lab session required for production sign-off beyond proxy.
3. Chapter-length directed render is long-RTF — job progress UI must show ETA.

## Workstream: directed renders + gate2 script.
