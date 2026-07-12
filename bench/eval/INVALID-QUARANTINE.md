# Quarantine — invalid Gate 2 claims

These artifacts are retained for audit history only. **Do not cite as PASS.**

## Offline directed-final “CMOS +1.0 PASS”

- Files: `bench/candidates/directed-final/*.wav`, historical `gate2-ledger.jsonl` / `gate2-unblind.json`
- Label: **INVALID — post-hoc DSP, not a product capability**
- Audio was produced by offline ffmpeg affect filters on raw Chatterbox, not solely by the live product job path at the time of the original claim
- Scoring used the circular absolute-F0 `affectFitness()` proxy

## Product-path “CMOS +0.75 PASS”

- Files: historical `gate2-product-path-*` when they claimed `pass: true`
- Label: **INVALID — circular objective proxy mislabeled as CMOS**
- Product-path renders themselves may be useful engineering artifacts; the **PASS claim** is invalid
- Current diagnostic file uses **proxy-named** keys only (`meanProxyExpressiveVsPiper`, not `meanCmosExpressiveVsPiper`)

## Current honest status

See `bench/eval/gate2-status.json` and `npm run eval:gate2:status`.

Until a human ledger exists under `human-sessions/`, Gate 2 is:

**NOT_CERTIFIED_AWAITING_HUMAN_PANEL**

Diagnostic proxy (not certifying): product-path mean **−0.25** under `meanProxyExpressiveVsPiper`.
