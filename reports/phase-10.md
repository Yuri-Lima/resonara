# Phase 10 — Novel-Length Soak

**Date:** 2026-07-12  
**Status:** COMPLETE

## What changed

- Expanded soak job for `samples/catalog/soak-novel.txt` (50,152 words).
- Fixed Nest JSON body limit (100kb → 2mb) after 413 on novel POST.
- Ran soak as monitored background farm job (platform × audiobook).
- Memory probe sampled RSS every 15s across the full run.
- TTS completed 1288/1288 chunks + concat; farm HTTP download hit Node Buffer 2GB limit — recovered via local `outputPath` copy; render-farm fixed to prefer `fs.copyFileSync`.

## Soak results (real)

| Metric | Value |
|--------|-------|
| Words | 50,152 |
| Chunks | 1288 |
| Wall time (TTS) | ~1,475,363 ms (~24.6 min) |
| Audio duration | 17,934.36 s (~4.98 h) |
| Output bytes | 2,582,548,002 (~2.4 GB) |
| WAV header | RIFF/WAVE valid |
| Engine/profile | platform / audiobook |
| Farm status | COMPLETE (recovered ok) |

### Memory curve

```
samples: 101
minMB: 124.9  maxMB: 299.4  meanMB: 220.6  lastMB: 223.9
plateau: true
```

RSS oscillated in a band (~200–270 MB during synth, dipped during concat) — **not** a monotonic leak.

### Concurrency proof (commits inside soak window)

Soak `startedAt`: **2026-07-12T15:42:18.384Z**  
Soak completed ~**2026-07-12T16:07:00Z**

Commits during window (from git log):

```
ba24426 2026-07-12 17:42:29 +0200 fix(api): raise JSON body limit to 2mb…
c44bd87 2026-07-12 17:42:44 +0200 docs(farm): Phase 10 concurrent — ledger…
4f82f4d 2026-07-12 17:42:57 +0200 docs(farm): Phase 10 concurrent — RELEASE_QUALIFICATION…
99d1133 2026-07-12 17:43:15 +0200 fix(ui): Phase 10 concurrent — soak chart…
bca94c0 2026-07-12 17:43:… docs(farm): Phase 10 concurrent — catalog state…
6c55fdf 2026-07-12 17:54:17 +0200 feat(packaging): Phase 11 dual-platform… (also inside window)
```

## Commands + real output tails

```
$ curl …/tts/jobs/b86f10c3-… → status completed, chunksDone 1288/1288
$ farm log: download error "length … Received 2582548002" (Node Buffer max)
$ cp …/speech.wav farm-output/soak/soak-novel__platform__audiobook.wav
$ ffprobe → 17934.360417
$ memory-curve plateau true, n=101
```

## Self-review Pass A

- Novel-length document rendered end-to-end through product TTS API.
- Memory sampled with real RSS; plateau criterion applied.
- Concurrent packaging + report commits timestamped inside window.

## Self-review Pass B — 3 findings

1. **scripts/render-farm.js httpRequest** — Failure: buffers full download → fails >2GB. **Fixed:** local `outputPath` copy path.
2. **Nest default body 100kb** — Failure: 413 on 50k-word POST. **Fixed:** 2mb JSON limit in main.ts.
3. **soak-memory-probe lsof** — Failure: slow lsof can delay samples. Mitigation: samples still collected; plateau uses RSS band not handle count.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| p10-soak-farm | novel render | landed COMPLETE (recovered) | ~24.6 min |
| p10-memory-probe | RSS curve | landed plateau=true | ~25 min |
| p10-body-limit | concurrent fix | landed | concurrent |
| p10-report-commits | concurrent docs | landed | concurrent |
| p11-packaging | concurrent builds | landed | concurrent |

## Evidence check

- [x] state.json COMPLETE + recovered ok
- [x] WAV non-zero valid header + duration
- [x] memory-curve.json real samples + plateau
- [x] commit timestamps inside startedAt→completedAt
