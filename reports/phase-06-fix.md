# Phase 06-fix — Real WER + Real Pause Conformance (G31)

**Date:** 2026-07-12  
**Campaign:** G31 quality-metrics honesty (follow-on to G30 Phase 6 proxy measurement)

## Problem statement

G30 qualification quality metrics were **proxies, not measurements**, and this was not surfaced at the gate:

- Every WER was `method.wer="duration-density-proxy"`, `werIsProxy=true` (24/24 + 36/36).
- `scripts/farm-measure.js` skipped ASR unless `FARM_MEASURE_WHISPER=1` (never set); whisper venv absent.
- `pauseConformance` was a **constant 1.0** via `ffmpeg-silencedetect` heuristic.
- Gate floors (WER≤0.35, pause≥0.9) were cleared by proxy + constant.

**Failure mode to fix:** a proxy labeled as WER presented as a measured gate result.

## What changed

| Area | Change |
|------|--------|
| Whisper install | `node scripts/download-whisper.js` as monitored background job → `tools/whisper-venv` + tiny/base models cached |
| WER | `tryTranscribe` uses `tools/whisper/transcribe.py` (faster-whisper); `FARM_MEASURE_WHISPER=1` full sweeps |
| WER ref pin | `stripMarkupForWer` so SSML tags are not scored as spoken words |
| Pause | Replaced silencedetect constant with `pause-probe` **profile-band** scorer (`scoreProfileBandConformance`) |
| Aggregates | `meanWerMeasured` / `proxyWerCount` / `realPauseCount` / methodology block |
| Gate | `WER_PROXY_ONLY`, `PAUSE_PROXY_ONLY`, cell breaches; **never** clears on proxy WER |
| Dashboard | WER kind + pause kind columns; proxy cells highlighted |
| CLI | `--sample-representative`, interleave short-first, progress pollable |

## Real output tails

### Whisper install (`logs/download-whisper.log`)

```
Model tiny ready
Downloading Whisper model: base → …/tools/whisper/models
loaded base
Model base ready
Done. Python: …/tools/whisper-venv/bin/python
```

Whisper **runs offline** after install (`HF_HUB_OFFLINE=1` during measure).

### Representative sample (first)

- Matrix sample: **8/8** (1 content type × both engines for 4 matrix content types)
- Catalog sample: **12/12** (≥1 doc per content type; catalog is piper-only)

Sample mean ASR WER catalog≈0.293 / matrix≈0.253; all `werIsProxy=false`; pause method `pause-probe-profile-band`.

### Full sweep (`logs/measure-*-full.log`)

```
[sweep] matrix full 2026-07-12T17:05:18Z  → COMPLETE 36/36
[sweep] catalog full 2026-07-12T17:08:49Z → COMPLETE 24/24
[sweep] gates 2026-07-12T17:12:34Z
[sweep] COMPLETE 2026-07-12T17:12:34Z
```

Catalog measure-complete excerpt:

```json
{
  "event": "measure-complete",
  "batch": "catalog",
  "methodology": {
    "wer": "faster-whisper-asr",
    "pause": "pause-probe-profile-band",
    "whisperEnabled": true,
    "whisperAvailable": true,
    "whisperModel": "tiny",
    "note": "All WER rows are ASR-measured (werIsProxy=false)."
  },
  "meanWerMeasured": 0.2520762972365838,
  "measuredWerCount": 24,
  "proxyWerCount": 0,
  "meanConformance": 0.33983333333333327,
  "realPauseCount": 24,
  "invalidAudio": 0
}
```

Matrix: `meanWerMeasured≈0.253`, `measuredWerCount=36`, `proxyWerCount=0`, `meanConformance≈0.485`, `realPauseCount=36`.

### Gate (real metrics)

```json
{
  "verdict": "NO-GO",
  "findings": [
    { "code": "WER_CELL_BREACH", "threshold": 0.35 },
    { "code": "PAUSE_CONFORMANCE", "detail": 0.34, "threshold": 0.9 },
    { "code": "PAUSE_CELL_BREACH", "threshold": 0.9 }
  ],
  "methodology": {
    "honesty": "gate-on-measured-wer-and-profile-band-pause"
  }
}
```

Primary gate file: `farm-output/metrics/gate-result.json` (catalog). Matrix: `gate-matrix.json`. Both **NO-GO**.

## Per-doc WER (full catalog, measured)

| id | WER | kind |
|----|-----|------|
| en-quick-sentence__piper__audiobook | 0.000 | measured |
| en-children-story__piper__audiobook | 0.014 | measured |
| en-news-expanded__piper__audiobook | 0.032 | measured |
| en-short-article__piper__audiobook | 0.056 | measured |
| en-long-essay__piper__audiobook | 0.060 | measured |
| en-paragraph__piper__audiobook | 0.068 | measured |
| en-book-chapter__piper__audiobook | 0.098 | measured |
| en-dialogue-script__piper__audiobook | 0.118 | measured |
| en-ssml-showcase__piper__audiobook | 0.152 | measured |
| en-news__piper__audiobook | 0.152 | measured |
| pt-capitulo__piper__audiobook | 0.160 | measured |
| pt-paragrafo__piper__audiobook | 0.167 | measured |
| pt-artigo__piper__audiobook | 0.188 | measured |
| pt-dialogo__piper__audiobook | 0.236 | measured |
| pt-ensaio__piper__audiobook | 0.253 | measured |
| pt-ssml__piper__audiobook | 0.263 | measured |
| pt-historia__piper__audiobook | 0.264 | measured |
| en-pronunciation-challenge__piper__audiobook | 0.322 | measured |
| en-numbers-and-dates__piper__audiobook | **0.361** | measured |
| en-technical-doc__piper__audiobook | **0.454** | measured |
| pt-tecnico__piper__audiobook | **0.580** | measured |
| pt-noticia__piper__audiobook | **0.618** | measured |
| pt-pronuncia__piper__audiobook | **0.663** | measured |
| pt-numeros__piper__audiobook | **0.771** | measured |

Matrix full table: `farm-output/metrics/matrix-metrics.md` (36 rows, all measured). Highest breaches are **platform × pt-BR** (0.59–0.92).

## Self-review Pass B — 3 adversarial findings

1. **Pause profile-band systematically fails minConformance 0.9**  
   *Reproduce:* full catalog/matrix measure → meanConf 0.34 / 0.49; conf varies (not constant 1.0).  
   *Cause:* farm WAV silence mass is short inter-word gaps (piper p50≈56 ms); contract sentence/paragraph bands under-hit at punctuation boundaries despite `pauseProfile` on synthesize.  
   *Pin:* keep threshold; product pause insertion / measurement alignment is the work — **do not** restore silencedetect constant.

2. **Platform engine Portuguese WER systematically >0.35**  
   *Reproduce:* all `pt-*__platform__*` matrix cells WER 0.59–0.92; piper twins on same docs ~0.22–0.28.  
   *Cause:* macOS `say` pt-BR path vs orthographic reference under ASR.  
   *Pin:* recommendations already prefer platform only for **en** content; flag platform×pt-BR as NO-GO cells.

3. **Numbers / technical / pronunciation content-type debt**  
   *Reproduce:* `pt-numeros` 0.771, `en-numbers-and-dates` 0.361, `en-technical-doc` 0.454, `pt-tecnico` 0.580.  
   *Cause:* spoken number expansion + domain terms diverge from written ref under tiny ASR; not a proxy artifact.  
   *Pin:* content-type backlog; optional base model re-measure — **do not** raise WER floor.

**Bonus pin (measurement):** SSML markup in reference inflated WER (~0.62) until `stripMarkupForWer` — fixed; not a TTS regression.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-download-whisper | Install faster-whisper + tiny/base | landed COMPLETE | ~1–2 min + model DL |
| bg-measure-sample | Representative sample ASR + profile-band | landed 8+12 | ~2 min |
| bg-measure-full | Full matrix 36 + catalog 24 | landed COMPLETE | ~7 min wall |
| fg-gate-real | Gate on measured metrics | **NO-GO** with findings | <1 s |
| fg-ssml-wer-pin | Strip SSML from WER ref | landed (0.62→0.15) | code |
| fg-pause-profile-band | Real pause-probe bands | landed (varies 0–0.85) | code |
| fg-dashboard-kinds | measured vs proxy UI columns | landed | code |

See also `reports/workstream-ledger.json`.

## Review loop

- `npx jest --config jest.farm.config.js` → **28/28 pass**
- `npm run lint` → 0 errors (pre-existing warnings only)
- `npm run build` → nest build OK
- **Do not push** (per task)

## Artifacts

| Path | Role |
|------|------|
| `farm-output/metrics/catalog-metrics.json` | Full catalog measured rows |
| `farm-output/metrics/matrix-metrics.json` | Full matrix measured rows |
| `farm-output/metrics/*-sample-metrics.json` | Representative sample snapshots |
| `farm-output/metrics/gate-*.json` | Gate results (NO-GO) |
| `RELEASE_QUALIFICATION.md` | Sign-off surface (honest NO-GO) |
| `ui/deliverable/data.js` | Dashboard data with kinds |
| `logs/download-whisper.log` | Whisper install |
| `logs/measure-*-full.log` | Sweep tails |

## Offline note

If whisper cannot run offline, RELEASE_QUALIFICATION and gate **must** say so explicitly and must **not** present proxy WER as measured. In this environment whisper **did** run offline after install — no such disclaimer required beyond methodology tables marking all rows measured.
