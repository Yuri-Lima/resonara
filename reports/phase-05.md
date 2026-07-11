# Phase 5 Report — Listening Gate 1 (raw tier)

## Protocol
`node scripts/blind-gate.js` — randomized blind files, ledger before unblind.

## Result
See `reports/gate1-run.txt` and `bench/eval/gate1-unblind.json`.

Multi-factor CMOS proxy (energy std, rate variance, F0 std, mild diversity).
Raw Turbo path does not apply exaggeration; directed full model is Gate 2.

## Adversarial (3)
1. Proxy ≠ human CMOS — documented; eval-lab UI is human path.
2. Synthetic tone ref degraded first pass — fixed to Piper-speech ref.
3. Turbo ignores exaggeration — full ChatterboxTTS used for directed.

## Workstream: gate1 script + ledger landed.
