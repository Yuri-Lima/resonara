# Gate 2 product-path re-certification

**Date:** 2026-07-12T10:47:34.798Z
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

## CMOS (proxy protocol, same as blind-gate.js)

```json
{
  "gate": 2,
  "exprRoot": "bench/candidates/product-path",
  "tag": "product-path",
  "meanCmosExpressiveVsPiper": 0.75,
  "n": 4,
  "pass": true,
  "ledger": "/private/tmp/trace-sweG29-20260712-013205/bench/eval/gate2-product-path-ledger.jsonl",
  "unblind": [
    {
      "fixture": "death-scene",
      "cmosExpressiveVsPiper": 1,
      "flip": false
    },
    {
      "fixture": "picnic",
      "cmosExpressiveVsPiper": 2,
      "flip": true
    },
    {
      "fixture": "dialogue-performance",
      "cmosExpressiveVsPiper": 0,
      "flip": true
    },
    {
      "fixture": "newscast",
      "cmosExpressiveVsPiper": 0,
      "flip": false
    }
  ],
  "source": "product-path",
  "note": "Scored from product direction path (autoDirect+REM+humanize AF), not offline directed-final."
}
```

**PASS** mean CMOS **0.75** ≥ +0.5

## Honesty

- This is **not** a re-label of `directed-final/` offline artifacts.
- Scores use the same objective CMOS proxy as Gate 2 (prosody metrics), not a fresh human panel.
- If FAIL: product path is wired but may not yet beat Piper on this proxy — ship scaffolding is fixed; quality is measured honestly.
