# Gate 2 product-path — diagnostic render + proxy (NOT certified)

**Date:** 2026-07-12T11:12:40.860Z
**Source:** `bench/candidates/product-path/` (live product direction path)

## Pipeline

1. `applyAutoDirection` (style prefix)
2. `injectBreathMarkers` when humanize
3. `compileRem` + `buildExpressionRuntime` (exaggeration, content affect, multiControl)
4. `tools/expressive/synthesize.py` with **runtime exaggeration** (not hardcoded 0.55)
5. `expressionAudioFilter` → ffmpeg `-af` (same graphs as `directedAudioFilter`)

## Per-fixture expression

| Fixture | Affect | Exaggeration | AF |
|---------|--------|--------------|----|
| death-scene | grief | 0.58 | `asetrate=24000*0.92,aresample=24000,atem…` |
| picnic | joy | 0.62 | `asetrate=24000*1.07,aresample=24000,atem…` |
| dialogue-performance | neutral | 0.51 | `acompressor=threshold=-20dB:ratio=1.8:at…` |
| newscast | news | 0.30 | `volume=1.0…` |

## Objective prosody proxy (NOT CMOS)

Automated relative proxy only. **Does not certify Gate 2.**

```json
{
  "gate": 2,
  "exprRoot": "bench/candidates/product-path",
  "tag": "product-path",
  "metricName": "objective-prosody-proxy-v2",
  "isHumanCmos": false,
  "certified": false,
  "gateStatus": "NOT_CERTIFIED_AWAITING_HUMAN_PANEL",
  "meanProxyExpressiveVsPiper": -0.25,
  "n": 4,
  "pass": false,
  "humanCmosNotRun": true,
  "note": "Objective prosody proxy only on product-path WAVs. NOT human CMOS. NOT a Gate 2 pass.",
  "ledger": "/private/tmp/trace-sweG29-20260712-013205/bench/eval/gate2-product-path-ledger.jsonl",
  "unblind": [
    {
      "fixture": "death-scene",
      "proxyExpressiveVsPiper": -1,
      "flip": false
    },
    {
      "fixture": "picnic",
      "proxyExpressiveVsPiper": 0,
      "flip": true
    },
    {
      "fixture": "dialogue-performance",
      "proxyExpressiveVsPiper": 0,
      "flip": true
    },
    {
      "fixture": "newscast",
      "proxyExpressiveVsPiper": 0,
      "flip": false
    }
  ],
  "source": "product-path"
}
```

**Status:** `NOT_CERTIFIED_AWAITING_HUMAN_PANEL`

Proxy score (expressive vs Piper): **-0.25** (n=4). Human CMOS not run.

This is **not** a PASS. Gate 2 requires `ui/eval-lab` human blind panel → `bench/eval/human-sessions/`.

## Honesty

- Product-path audio is real product wiring (not offline directed-final DSP alone).
- Proxy is **not** MOS/CMOS; absolute F0 band rewards were removed as circular.
- Offline directed-final "+1.0 PASS" is **INVALID — post-hoc DSP**.
- Run `node scripts/adversarial-proxy-sanity.js` and `node scripts/gate2-status.js`.
