# Phase 10 — Novel-Length Soak (Piper primary)

**Date:** 2026-07-12  
**Status:** COMPLETE  
**Primary engine:** **piper** (product path: Node → piper subprocess per chunk)  
**Secondary:** platform (macOS `say`) retained under `farm-output/soak/platform-secondary/`

## What changed

- Re-ran `samples/catalog/soak-novel.txt` (50,152 words) end-to-end with **engine=piper** as the primary stability proof.
- Monitored background farm job + RSS/handle probe every 15s on the lite-server PID.
- Platform soak from earlier G30 remains a secondary data point only (OS-process TTS; does not exercise the Node/piper-subprocess pipeline used by long-form product renders).

## Primary soak results (piper × audiobook) — real

| Metric | Value |
|--------|-------|
| Words | 50,152 |
| Chunks | 1288 |
| TTS job | `3bb01783-4de7-4fae-99e6-eeb3b4184597` |
| Wall time (farm job) | 5,023,907 ms (~83.7 min) |
| Audio duration | 18,588.85 s (~5.16 h) |
| Output bytes | 2,676,794,950 (~2.5 GB) |
| WAV header | RIFF/WAVE valid (`pcm_s24le` 48 kHz mono) |
| Engine/profile | **piper** / audiobook (voice `piper:en_US-lessac-medium`) |
| Farm status | COMPLETE (ok) |
| Orphans at end | **0** piper / ffmpeg children |

### Memory curve (lite-server RSS)

```
samples: 359 (15s interval)
synth+concat window: minMB 104.8  maxMB 257.3  meanMB 178.8  lastMB@COMPLETE ~168
full probe (incl. idle drop): minMB 57.7  maxMB 257.3
strictlyMonotonic: false
slopeMBPerSample (synth window): +0.021 (~flat)
plateau / no-leak: true
handles: 22–30 (stable; no handle leak)
```

Decimated curve (RSS MB over wall clock UTC):

```
17:38 257 → 17:42 158 → 17:46 152 → 17:51 136 → 17:55 163
17:59 187 → 18:03 174 → 18:08 204 → 18:12 206 → 18:16 200
18:20 207 → 18:25 212 → 18:29 245 → 18:33 197 → 18:37 173
18:42 199 → 18:46 226 → 18:50 148 → 18:54 130 → 18:59 131
19:01 COMPLETE (concat/loudnorm done) → idle drop toward ~58–107 MB
```

RSS oscillated in a **~105–257 MB band** during 1288 Piper subprocess spawns + ffmpeg concat — **not** a monotonic climb. Handle count stayed flat (22–30).

### Why piper is the primary proof

Platform synthesizes in a separate OS process (`say`). A flat platform RSS curve does not exercise the product's **Node parent + per-chunk Piper child + ffmpeg** path that 8-hour audiobooks use. This soak does.

## Secondary data point (platform, earlier)

| Metric | Value |
|--------|-------|
| Engine | platform / audiobook |
| Words / chunks | 50,152 / 1288 |
| Duration / bytes | 17,934 s (~4.98 h) / 2,582,548,002 |
| Memory | 101 samples, min 124.9 / max 299.4 / mean 220.6 MB, plateau true |
| Evidence | `farm-output/soak/platform-secondary/` |

## Commands + real output tails

```
$ node scripts/render-farm.js run --manifest farm-output/soak/manifest.json
  # FARM_JOB_TIMEOUT_MS=4h; engine=piper forced in manifest
$ node scripts/soak-memory-probe.js --pid <lite> --interval-ms 15000
$ curl …/tts/jobs/3bb01783-… → completed, chunksDone 1288/1288
$ ffprobe farm-output/soak/soak-novel__piper__audiobook.wav
  duration=18588.853104  size=2676794950  codec=pcm_s24le  48000 Hz mono
$ xxd -l 12 …wav → 5249 4646 … 5741 5645  (RIFF…WAVE)
$ pgrep -fl 'piper|ffmpeg' → (none) after teardown
```

## Self-review

- Full 50k novel rendered on **piper** product path (not truncated).
- Memory sampled with real RSS + handles; no monotonic leak.
- Single valid long WAV verified via header + ffprobe duration.
- Zero orphaned piper/ffmpeg children after farm COMPLETE + server stop.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| p10-piper-soak | novel render engine=piper | landed COMPLETE | ~83.7 min |
| p10-memory-probe | RSS+handles curve | landed no-leak / plateau | ~90 min |
| p10-wav-verify | ffprobe + RIFF | landed 5.16 h / 2.5 GB | — |
| p10-orphan-check | zero children | landed | — |
| p10-docs-dashboard | phase-10 + RQ + chart | landed | — |

## Evidence check

- [x] state.json COMPLETE + job ok, engine=piper
- [x] WAV non-zero valid header + duration
- [x] memory-curve.json real samples + no-leak
- [x] platform secondary archived
- [x] zero orphans at end
