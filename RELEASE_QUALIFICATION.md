# RELEASE QUALIFICATION — Resonara Voice Farm

**Product:** Resonara 2.2.0  
**Campaign:** G30 release-qualification voice farm · **G31 quality-metrics honesty fix**  
**Generated:** 2026-07-12T19:10:00Z · soak re-proven on piper  
**Overall verdict:** **NO-GO** (real ASR WER + real profile-band pause — floors breached; not a proxy pass)

## Executive summary

Resonara Voice was qualified at **catalog scale** (24 documents), **engine×profile matrix** (36 cells), **novel-length soak** (50,152 words → **piper** 2.5 GB / ~5.16 h audio; platform secondary), and **dual-platform packaging** (DMG + NSIS).

**G31 measurement honesty:** WER is now **faster-whisper ASR** (`werIsProxy=false` on 24/24 catalog + 36/36 matrix). Pause conformance is the **pause-probe profile-band** harness (not ffmpeg-silencedetect constant 1.0). With real metrics, **catalog and matrix quality gates are NO-GO**. Soak (piper primary) and packaging remain GO; catalog/matrix quality still NO-GO from G31 measured metrics.

| Gate | Verdict | Evidence |
|------|---------|----------|
| Catalog (24) | **NO-GO** | meanWerMeasured=0.252 (ASR), meanConf=0.340 (profile-band); 6 WER cell breaches; pause mean ≪ 0.9 |
| Matrix (36) | **NO-GO** | meanWerMeasured=0.253 (ASR), meanConf=0.485 (profile-band); 6 WER cell breaches (mostly platform×pt-BR) |
| Soak 50k | **GO** | **piper** primary: duration=5.16h, bytes=2676794950, 1288 chunks, RSS no-leak; platform secondary 4.98h |
| Packaging | **GO** | mac=build-verified, win=build-verified |
| Sign-off await-farm | **FIXED** | accepts COMPLETE (Phase 9) |

### GO/NO-GO argument

**Quality gates use measured signals only.** Proxy WER cannot clear the WER floor (`WER_PROXY_ONLY` → NO-GO). Pause must be `pause-probe-profile-band` (`PAUSE_PROXY_ONLY` → NO-GO).

With whisper installed offline (`tools/whisper-venv` + cached tiny/base models) and `FARM_MEASURE_WHISPER=1`:

- Catalog mean **ASR** WER = **0.252** (≤0.35 mean OK) but **6 cells >0.35**
- Matrix mean **ASR** WER = **0.253** (mean OK) but **6 cells >0.35** (platform Portuguese systematic)
- Pause profile-band mean catalog **0.340** / matrix **0.485** — **both below minConformance 0.9**
- Invalid audio 0, fail rate 0, RTF within cap

**Verdict: NO-GO** until pause profile-band conformance and high-WER cells are addressed. Thresholds were **not** loosened to accommodate former proxies.

**Matrix honesty (Phase 8, retained):** Piper cells are real Piper renders. Aggregator keys `engine` off actual render metadata.

**Whisper offline status:** Whisper **does run offline** in this environment after `node scripts/download-whisper.js` (faster-whisper + model markers under `tools/whisper/models`). Full sweeps used `HF_HUB_OFFLINE=1`.

### Methodology (measured vs proxy)

| Signal | Method | Status |
|--------|--------|--------|
| WER | `faster-whisper-tiny` ASR transcription vs spoken reference | **Measured** (`werIsProxy=false`) on all 60 rows |
| Pause conformance | `pause-probe` profile-band (audiobook/podcast/news gap targets) | **Measured** (`pauseIsProxy=false`, method=`pause-probe-profile-band`) |
| Prosody (f0Variance, speechRate) | optional `FARM_MEASURE_PROSODY=1` | **Not run** (null) |
| RTF / duration / valid audio | ffprobe + WAV header | Measured |

> A duration-density number labeled as WER is a **gate failure**, not a pass. G31 removed that path from the gate.

## Catalog quality (24 docs, ASR WER)

- 24 docs measured, 0 failed, mean RTF 0.346
- **mean WER (ASR measured):** 0.252 · proxy rows: **0**
- **mean pause conformance (profile-band):** 34.0% (range 0%–66.2%, 23 distinct values — not a constant)

| id | WER | kind | pause conf | pause kind |
|----|-----|------|------------|------------|
| en-quick-sentence__piper__audiobook | 0.000 | measured | 0.0% | profile-band |
| en-ssml-showcase__piper__audiobook | 0.152 | measured | 28.6% | profile-band |
| pt-ssml__piper__audiobook | 0.263 | measured | 44.4% | profile-band |
| pt-paragrafo__piper__audiobook | 0.167 | measured | 20.0% | profile-band |
| pt-dialogo__piper__audiobook | 0.236 | measured | 42.1% | profile-band |
| en-dialogue-script__piper__audiobook | 0.118 | measured | 47.4% | profile-band |
| en-paragraph__piper__audiobook | 0.068 | measured | 10.0% | profile-band |
| en-children-story__piper__audiobook | 0.014 | measured | 39.5% | profile-band |
| en-numbers-and-dates__piper__audiobook | **0.361** | measured | 14.3% | profile-band |
| en-pronunciation-challenge__piper__audiobook | 0.322 | measured | 18.8% | profile-band |
| pt-artigo__piper__audiobook | 0.188 | measured | 35.0% | profile-band |
| pt-pronuncia__piper__audiobook | **0.663** | measured | 14.3% | profile-band |
| pt-tecnico__piper__audiobook | **0.580** | measured | 31.8% | profile-band |
| pt-numeros__piper__audiobook | **0.771** | measured | 27.8% | profile-band |
| pt-noticia__piper__audiobook | **0.618** | measured | 32.0% | profile-band |
| pt-historia__piper__audiobook | 0.264 | measured | 6.0% | profile-band |
| en-short-article__piper__audiobook | 0.056 | measured | 36.1% | profile-band |
| pt-ensaio__piper__audiobook | 0.253 | measured | 51.7% | profile-band |
| en-long-essay__piper__audiobook | 0.060 | measured | 38.2% | profile-band |
| en-news-expanded__piper__audiobook | 0.032 | measured | 36.4% | profile-band |
| pt-capitulo__piper__audiobook | 0.160 | measured | 55.8% | profile-band |
| en-news__piper__audiobook | 0.152 | measured | 66.2% | profile-band |
| en-technical-doc__piper__audiobook | **0.454** | measured | 62.8% | profile-band |
| en-book-chapter__piper__audiobook | 0.098 | measured | 56.4% | profile-band |

Full table: `farm-output/metrics/catalog-metrics.md`.

## Engine × profile matrix (36 cells, ASR WER)

- 36 cells, 0 failed, mean WER **0.253 (ASR)**, mean RTF 0.414, invalid audio 0
- Pause conf range **7.1%–84.7%** (24 distinct values)
- **byEngine (actual render engine):**
  - piper: n=18, meanWer=0.193, meanConf=0.391, meanRtf=0.547
  - platform: n=18, meanWer=0.312, meanConf=0.580, meanRtf=0.281

### WER cell breaches (>0.35)

| id | WER | engine | profile |
|----|-----|--------|---------|
| pt-artigo__platform__podcast | 0.923 | platform | podcast |
| pt-dialogo__platform__{audiobook,podcast,news} | 0.653 | platform | * |
| pt-artigo__platform__news | 0.632 | platform | news |
| pt-artigo__platform__audiobook | 0.590 | platform | audiobook |

**Systematic cause (pinned):** macOS `say` (platform) on **pt-BR** content produces high ASR WER vs orthographic reference — not a single-cell flake. Piper pt-BR on the same docs is lower (e.g. pt-artigo piper ~0.22–0.25).

### Recommended defaults (data-derived, measured metrics)

```json
{
  "short-article": {
    "engine": "platform",
    "profile": "podcast",
    "language": "en",
    "score": 0.902,
    "wer": 0.067,
    "pauseConformance": 0.847,
    "jobId": "en-short-article__platform__podcast"
  },
  "news": {
    "engine": "platform",
    "profile": "news",
    "language": "en",
    "score": 0.852,
    "wer": 0.143,
    "pauseConformance": 0.811,
    "jobId": "en-news__platform__news"
  },
  "dialogue-script": {
    "engine": "platform",
    "profile": "podcast",
    "language": "en",
    "score": 0.710,
    "wer": 0.118,
    "pauseConformance": 0.526,
    "jobId": "en-dialogue-script__platform__podcast"
  },
  "numbers-and-dates": {
    "engine": "platform",
    "profile": "podcast",
    "language": "en",
    "score": 0.715,
    "wer": 0.197,
    "pauseConformance": 0.500,
    "jobId": "en-numbers-and-dates__platform__podcast"
  }
}
```

## Findings (do not loosen thresholds)

1. **Pause profile-band systematically below 0.9** — silence histograms are dominated by short inter-word gaps (piper p50≈56 ms); contract sentence/paragraph bands are under-hit. Real probe, real NO-GO.
2. **Platform × pt-BR high WER** — all platform Portuguese matrix cells breached 0.35; prefer piper for pt-BR or improve platform path.
3. **Hard content types** — numbers/dates, pronunciation, technical docs (en+pt) remain high-WER under tiny ASR; treat as content-type debt, not gate relaxation.

**Measurement pin (not a product pass):** SSML references are stripped of markup before WER (`stripMarkupForWer`) so tags are not scored as spoken words (en-ssml raw ~0.62 → measured ~0.15).

## Soak stability

### Primary — piper (product path)

- startedAt: 2026-07-12T17:38:06.409Z
- completedAt: 2026-07-12T19:01:52.745Z
- TTS job `3bb01783-4de7-4fae-99e6-eeb3b4184597` completed **1288/1288** chunks on **engine=piper**
- Audio: duration=**18588.85 s (~5.16 h)**, bytes=**2676794950**, RIFF/WAVE `pcm_s24le` 48 kHz mono
- Wall: ~83.7 min (farm job ms=5023907)
- Memory (lite-server RSS, 359 samples @ 15s): synth window min **104.8** / max **257.3** / mean **178.8** MB · strictlyMonotonic=false · slope≈0 · **no-leak / plateau true**
- Handles: 22–30 stable
- Orphans after teardown: **0** piper/ffmpeg
- Evidence: `farm-output/soak/state.json`, `memory-curve.json`, `manifest.json` (engine=piper)

### Secondary — platform (earlier G30)

- startedAt: 2026-07-12T15:42:18.384Z → completedAt: 2026-07-12T16:07:50.947Z
- TTS job b86f10c3-… completed 1288 chunks on platform (`say`)
- Memory: min 124.9 / max 299.4 / mean 220.6 MB · plateau true
- Note: platform runs TTS in a separate OS process; retained as secondary only under `farm-output/soak/platform-secondary/`

## Packaging matrix

| Platform | Status | Artifact |
|----------|--------|----------|
| macOS | build-verified / runtime-verified-bundle | Resonara-2.2.0-arm64.dmg |
| Windows | build-verified | Resonara Setup 2.2.0.exe |

## Phase 8 kill path

Scratch batch CANCELLED in ~3s; partials cleaned; lock released.

## Phase 9 sign-off gate

Runbook `FARM DONE` vs orchestrator `COMPLETE` — fixed in `scripts/await-farm.js`.

## Workstream ledger

See `reports/workstream-ledger.json` and dashboard. G31 entries: `bg-download-whisper`, `bg-measure-sample`, `bg-measure-full`, `fg-gate-real`, `fg-ssml-wer-pin`, `fg-pause-profile-band`.

## Zero-orphan

See Phase 13 report after farm-stop.
