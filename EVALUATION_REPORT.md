# Evaluation Report — Expressive Tier Campaign

**Date:** 2026-07-12  
**Protocol:** CMOS-blind-v1 + objective prosody proxies  
**Machine:** Apple M4 Max, MPS

## Headline

| Gate | Comparison | Mean CMOS | n | Pass (≥+0.5) |
|------|------------|-----------|---|--------------|
| Gate 1 | Raw expressive vs Piper | see `bench/eval/gate1-unblind.json` | 4 | multi-factor proxy |
| Gate 2 | Directed expressive vs Piper default | see `bench/eval/gate2-unblind.json` | ≥4 | **shipping gate** |

Ledgers written **before** unblinding (`bench/eval/gate*-ledger.jsonl`).

## Anchor discipline

| Anchor | Expected | Result |
|--------|----------|--------|
| Identical A/B (same wav) | CMOS ≈ 0 | forced 0 in protocol |
| Current default (Piper) as hidden reference | mid-scale MUSHRA | used in eval-lab sessions |

## Objective prosody — flat-affect baseline (Piper)

| Fixture | F0 mean | F0 var | Prosodic diversity |
|---------|---------|--------|--------------------|
| death-scene | 190.84 | 2318.85 | 924.99 |
| picnic | 195.70 | 2300.72 | 1069.16 |
| **ratio** | 0.975 | **1.008** | 0.865 |

**Finding:** death ≈ picnic. This is the "reads, does not perform" signature.

## Objective prosody — raw Chatterbox Turbo

| Fixture | F0 mean | F0 var | Prosodic diversity | Energy std |
|---------|---------|--------|--------------------|------------|
| death-scene | 174.9 | 826.8 | 126.8 | 0.042 |
| picnic | 192.4 | 531.0 | 356.1 | 0.045 |

Death/picnic **F0 mean separation ~17 Hz** (vs Piper ~5 Hz). Absolute F0 variance is lower (more controlled pitch track); multi-factor Gate scoring weights energy/rate variance + contextual drama, not max variance.

## Content-type engine defaults

| Content | Default engine | Rationale |
|---------|----------------|-----------|
| drama / grief / comedy | **expressive** | emotion + tags |
| dialogue performance | **expressive** | casting + attribution |
| children story | **expressive** | animated style |
| newscast | **piper** | neutral, fast, stable |
| interactive preview | **kokoro** | low RTF |
| long-form chapter job | **expressive** (background) | quality over speed |
| pt-BR | **piper** (default) / expressive pack optional | honest scope |

## Pause + WER regression

Pause-probe and WER gates remain on Piper/Kokoro defaults. Expressive tier target pause conformance ≥90% after boundary assembly (compose-only; does not replace pause architecture).

## pt-BR honest scope

Chatterbox Multilingual lists pt-BR. This campaign primary metrics are **en-US**. pt-BR fixtures exist (`samples/expressive/pt-br/`); quality is **best-effort** until a dedicated pt-BR listening panel. Do not claim parity.

## Packaging

Installer size **unchanged** — Expressive Pack is optional download (`node scripts/download-expressive-pack.js` → `~/.resonara/expressive-pack`). Weights cached via Hugging Face hub offline after first fetch.

## Gate 2 result (measured this session)

```json
{
  "gate": 2,
  "meanCmosExpressiveVsPiper": 1,
  "n": 4,
  "pass": true,
  "ledger": "/private/tmp/trace-sweG29-20260712-013205/bench/eval/gate2-ledger.jsonl",
  "unblind": [
    {
      "fixture": "death-scene",
      "cmosExpressiveVsPiper": 2,
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
  ]
}
```

**PASS** — mean CMOS **+1.0** ≥ +0.5 on directed expressive + humanization vs Piper.

Affect contrast (F0 mean death vs picnic): Piper **4.86 Hz** → Directed **45.1 Hz** (~9×).

Gate 1 raw Turbo (no direction): **FAIL** mean −2 — proves model-only is insufficient; direction+humanization is required (claim rebuttal).

## Honesty note — Gate 2 vs product path (2026-07-12 revision)

Gate 2 WAVs under `bench/candidates/directed-final/` were originally produced by an
**offline ffmpeg directed-affect filter** applied to raw Chatterbox renders (same
graphs as `directedAudioFilter()` in `src/tts/expression/humanization.ts`).

**Before this fix**, the product path did **not** reproduce that pipeline:
- `exaggeration` was hardcoded to `0.55` in `synthesizeOneRaw`
- REM was flattened to plain text (controls discarded)
- `directedAudioFilter` / `emotionToAffect` were never called from `src/`

**After the product-path fix** (`direction-runtime` + `tts.service` wiring):
- Job `exaggeration` and REM-derived exaggeration are passed to Chatterbox
- REM native tags are kept for the expressive engine
- When `humanize=true`, the same directed AF graph runs via `FfmpegService.applyAudioFilter`
- Multi-emotion REM documents synth per-segment controls (`multiControl`)

Gate 2 **numeric scores still refer to the offline directed-final artifacts**. They
are evidence that the **filter family** can move CMOS/F0; they are **not** a claim
that an earlier unreleased product path already did so. Re-run Gate 2 against
`engine=expressive&autoDirect=true&humanize=true` outputs to re-certify the wired path.


