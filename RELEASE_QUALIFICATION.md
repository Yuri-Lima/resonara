# RELEASE QUALIFICATION — Resonara Voice Farm

**Product:** Resonara 2.2.0  
**Campaign:** G30 release-qualification voice farm  
**Generated:** 2026-07-12T16:54:47.661Z  
**Overall verdict:** **GO**

## Executive summary

Resonara Voice was qualified at **catalog scale** (24 documents), **engine×profile matrix** (36 cells), **novel-length soak** (50,152 words → 2.4 GB / ~5 h audio), and **dual-platform packaging** (DMG + NSIS). Catalog and matrix gates are **GO**. Soak completed with a **flat memory curve** (plateau). Installers are **build-verified**.

| Gate | Verdict | Evidence |
|------|---------|----------|
| Catalog (24) | **GO** | meanWer=0.103, conf=1, invalid=0, fail=0/24 |
| Matrix (36) | **GO** | meanWer=0.115, conf=1, invalid=0, fail=0/36 — **real Piper** on all 18 piper cells (Phase 8 fix) |
| Soak 50k | **GO** | duration=4.98h audio, bytes=2582548002, plateau=true |
| Packaging | **GO** | mac=build-verified, win=build-verified |
| Sign-off await-farm | **FIXED** | accepts COMPLETE (Phase 9) |

### GO/NO-GO argument

All measured quality gates (WER proxy ≤0.35, pause conf ≥0.9, invalid audio 0, fail rate ≤5%, RTF ≤5) pass on catalog and matrix. Soak proves long-form stability: RSS mean ~221 MB (max 299 MB) with plateau=true over 101 samples — no unbounded growth. Packaging produced Resonara-2.2.0-arm64.dmg (417 MB) and Resonara Setup 2.2.0.exe (336 MB).

**Matrix honesty (Phase 8 fix):** The three `en-numbers-and-dates__piper__{audiobook,podcast,news}` cells were originally platform-substituted under piper labels after a transient sqljs DB corruption. They were **re-rendered with actual Piper** (batch `matrix-piper-rerender`, 3/3 valid WAVs, byte-distinct from platform twins). Gate **GO** now stands on real Piper data. Aggregator keys `engine` off actual render metadata (`retryEngine` / `engine`), never the job id.

**Caveats (honest):**
- WER is primarily duration-density proxy unless whisper enabled (`FARM_MEASURE_WHISPER=1`).
- Windows NSIS is cross-built on darwin (build-verified, not runtime-tested on Windows).
- macOS installers are unsigned (not notarized).

## Catalog quality

- 24 docs measured, 0 failed, mean RTF 0.346

## Engine × profile matrix

- 36 cells, 0 failed, mean WER 0.115, mean RTF 0.414, invalid audio 0
- **byEngine (actual render engine):**
  - piper: n=18, meanWer=0.133, meanRtf=0.547
  - platform: n=18, meanWer=0.097, meanRtf=0.281
- Numbers×Piper cells (post re-render): audiobook WER≈0.247 / 5.69 MB; podcast WER≈0.243 / 5.60 MB; news WER≈0.237 / 5.47 MB — all `engine=piper`, valid WAV

### Recommended defaults (data-derived)

```json
{
  "short-article": {
    "engine": "platform",
    "profile": "news",
    "language": "en",
    "score": 0.9770380059707884,
    "wer": 0.025478010003679153,
    "pauseConformance": 1,
    "rtf": 0.07313784259826521,
    "jobId": "en-short-article__platform__news"
  },
  "news": {
    "engine": "platform",
    "profile": "news",
    "language": "en",
    "score": 0.9453276810779278,
    "wer": 0.08920899660865436,
    "pauseConformance": 1,
    "rtf": 0.07194785832815957,
    "jobId": "en-news__platform__news"
  },
  "dialogue-script": {
    "engine": "platform",
    "profile": "news",
    "language": "pt-BR",
    "score": 0.9363660385458243,
    "wer": 0.0289822972033404,
    "pauseConformance": 1,
    "rtf": 0.4872514715350768,
    "jobId": "pt-dialogo__platform__news"
  },
  "numbers-and-dates": {
    "engine": "platform",
    "profile": "podcast",
    "language": "en",
    "score": 0.864110679806509,
    "wer": 0.2493341688861037,
    "pauseConformance": 1,
    "rtf": 0.08086479711734294,
    "jobId": "en-numbers-and-dates__platform__podcast"
  }
}
```

## Soak stability

- startedAt: 2026-07-12T15:42:18.384Z
- completedAt: 2026-07-12T16:07:50.947Z
- TTS job b86f10c3-… completed 1288 chunks
- Memory: min 124.9 / max 299.4 / mean 220.6 MB · plateau **true**

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

See `reports/workstream-ledger.json` and dashboard.

## Zero-orphan

See Phase 13 report after farm-stop.
