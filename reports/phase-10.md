# Phase 10 Report — Listening Gate 2 (directed performance)

## Protocol
Directed REM + exaggeration on full ChatterboxTTS vs Piper default.
**Certifying target:** mean **human** CMOS ≥ +0.5 (eval-lab blind panel).

## Status (methodology correction 2026-07-12)

**NOT_CERTIFIED_AWAITING_HUMAN_PANEL**

Prior automated “PASS” numbers are invalid (circular F0-band proxy and/or post-hoc DSP).
See `bench/eval/INVALID-QUARANTINE.md` and `bench/eval/gate2-status.json`.

## Artifacts
- Product path renders: `bench/candidates/product-path/`
- Human ledgers (when present): `bench/eval/human-sessions/`
- Diagnostic proxy only: `bench/eval/gate2-product-path-unblind.json` (`pass: false`, not CMOS)
- Adversarial proxy sanity: `bench/eval/adversarial/adversarial-report.json`

## Notes
1. Human eval-lab session is required for Gate 2 sign-off.
2. Automated objective prosody proxy is diagnostic only and must not be labeled CMOS PASS.
3. Chapter-length directed render is long-RTF — job progress UI must show ETA.
