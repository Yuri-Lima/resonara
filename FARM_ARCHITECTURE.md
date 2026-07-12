# Resonara Release-Qualification Voice Farm — Architecture

> Design committed before machinery (Phase 1 / G30).
> Goal: prove product quality at **catalog scale** with measured data, not demo fixtures.

## 1. Why a farm

v2.0.0+ demos prove the pipeline *can* synthesize. They do not prove it holds
quality across dozens of documents, engines, languages, and pause profiles.
A qualification farm:

1. Renders a **catalog** (shippable audio library) from a bilingual corpus.
2. Renders a **measurement matrix** (engine × profile × content-type cells).
3. Runs a **novel-length soak** (~50k words) for memory/throughput stability.
4. Aggregates WER, pause-probe conformance, prosody, RTF into gates.
5. Emits a GO / NO-GO verdict backed by numbers.

## 2. Corpus design

Location: `samples/catalog/` with `manifest.json`.

| Content type | en | pt-BR | Notes |
|---|---|---|---|
| short-article | ✓ | artigo | ~400–600 words |
| news | ✓ (~2k) | noticia | news profile candidate |
| book-chapter | ✓ (~5k) | capitulo | audiobook default |
| technical-doc | ✓ | tecnico | numbers / jargon stress |
| dialogue-script | ✓ | dialogo | travessão in pt-BR |
| ssml-showcase | ✓ | ssml | markup path |
| children-story | ✓ | historia | softer pacing |
| numbers-and-dates | ✓ | numeros | formatter stress |
| pronunciation-challenge | ✓ | pronuncia | rare words |
| long-form essay | ✓ | ensaio | multi-section |
| soak-novel | ✓ only | — | ~50,000 words, seed-deterministic |

Reuse `samples/texts/**` fixtures where they fit; generate the rest
deterministically (seeded PRNG + public-domain-style prose templates).
No copyrighted text.

**Manifest schema** (`samples/catalog/manifest.json`):

```json
{
  "version": 1,
  "generatedAt": "ISO-8601",
  "seed": 42,
  "documents": [
    {
      "id": "en-news-article",
      "path": "samples/catalog/en-news-article.txt",
      "language": "en",
      "contentType": "news",
      "wordCount": 2039,
      "source": "fixture|generated",
      "soak": false
    }
  ]
}
```

## 3. Workload split

| Workload | Purpose | Size | Engine selection |
|---|---|---|---|
| **Catalog** | Shippable library | every non-soak doc × best-fit engine × language × **audiobook** profile (~30–40 jobs) | best available per language |
| **Measurement matrix** | Engine/profile comparison | 6-doc subset × every **available** engine × {audiobook, podcast, news} (~cells depend on engines) | all available |
| **Soak** | Stability / leak proof | `soak-novel.txt` once, audiobook profile, primary engine | platform or piper |

## 4. Orchestrator design (`scripts/render-farm.js`)

### 4.1 Job manifest

```json
{
  "version": 1,
  "name": "catalog|matrix|soak|smoke",
  "concurrency": 3,
  "jobs": [
    {
      "id": "job-uuid-or-slug",
      "docId": "en-short-article",
      "engine": "platform|piper|kokoro|expressive",
      "language": "en|pt-BR",
      "profile": "audiobook|podcast|news",
      "outPath": "farm-output/catalog/en-short-article__platform__audiobook.wav",
      "textPath": "samples/catalog/en-short-article.txt"
    }
  ]
}
```

### 4.2 Concurrency cap

- Default `N = 3` in-flight engine renders.
- Never spawn unbounded workers; further jobs queue.
- Cap is enforced in the farm worker pool (unit-tested).

### 4.3 Lite server lifecycle

- Before start: reap stale listeners on the farm/app port (`FARM_PORT`, default 3860).
- Boot `RESONARA_LITE=1 node dist/main.js` if `/health` is down.
- Submit via real TTS API: `POST /tts/synthesize` → poll `GET /tts/jobs/:id` →
  `GET /tts/jobs/:id/download`.

### 4.4 Rolling `state.json`

Written to `farm-output/<batch>/state.json` after every job:

```json
{
  "status": "RUNNING|COMPLETE|CANCELLED",
  "batch": "catalog",
  "total": 36,
  "done": 12,
  "failed": 1,
  "inFlight": ["job-slug-a", "job-slug-b"],
  "startedAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "completedAt": null,
  "concurrency": 3,
  "throughput": [{ "t": "ISO-8601", "done": 12 }],
  "jobs": { "job-slug": { "status": "ok|failed|cancelled", "ms": 1200, "rtf": 1.2, "bytes": 90000, "error": null } }
}
```

**Status vocabulary note:** orchestrator writes `COMPLETE` (not `FARM DONE`).
Ops runbook `docs/farm-ops-notes.md` documents a gate waiting for `FARM DONE` —
Phase 9 owns that mismatch.

### 4.5 PID lock

- `farm-output/farm.lock` holds the running farm PID.
- Second instance: if lock PID is alive → **refuse** to start.
- If lock PID is dead → take over with a logged warning (stale lock).

### 4.6 Cancel semantics

`node scripts/render-farm.js cancel`:

1. SIGTERM the farm PID from the lock.
2. Reap **all** in-flight engine/ffmpeg children (process group / tracked PIDs).
3. Delete partial outputs of interrupted jobs.
4. Set `status: CANCELLED`, release lock.

### 4.7 Status server

- Embedded HTTP server (default port `FARM_STATUS_PORT=3861`).
- `GET /farm/status` → current `state.json` body.
- This is the **monitor surface** for dashboards and session polling
  (not a bash sleep loop).

## 5. Measurement plan (`scripts/farm-measure.js`)

Per-output metrics:

| Metric | Source | Gate |
|---|---|---|
| WER | existing whisper QA normalizer + `wer` math (`src/tts/qa`) | catalog aggregate WER ≤ 0.25 (platform) / ≤ 0.15 (piper if available) |
| Pause conformance | pause-probe bands per profile | ≥ 90% boundaries in band |
| Prosody | F0 variance / speech-rate where harness exists | report-only (no hard fail) |
| Duration / RTF | job timing vs audio duration | RTF ≤ 5.0 platform; ≤ 2.0 piper |
| Valid audio | non-zero size + valid WAV/AIFF/MP3 header | 100% of completed jobs |

Outputs: `farm-metrics.json` + `farm-metrics.md`, written incrementally so
partial progress is pollable.

## 6. Release-qualification gate thresholds

A batch is **GO** when **all** hold:

1. **Zero** invalid-audio outputs among completed jobs.
2. Catalog aggregate WER ≤ threshold for the engine used.
3. Pause conformance ≥ 90% on probe-eligible docs.
4. Mean RTF within engine budget.
5. Soak: RSS curve plateaus (no monotonic growth across chunk samples).
6. Failed job rate ≤ 5% (isolated failures OK; systematic failures → kill + fix).

**NO-GO** if any systematic cause is found (wrong default profile, formatter
regression, leak). Obsolete in-flight batches are **cancelled immediately**.

## 7. Directory layout

```
samples/catalog/          # corpus + manifest.json
farm-output/
  farm.lock
  catalog/state.json      # + wavs + log.jsonl
  matrix/state.json
  soak/state.json
  metrics/farm-metrics.json
  metrics/farm-metrics.md
scripts/
  build-corpus.js
  render-farm.js
  farm-measure.js
  await-farm.js           # sign-off gate (Phase 9)
  open-ui.sh
ui/deliverable/           # qualification dashboard
FARM_ARCHITECTURE.md
docs/farm-ops-notes.md
reports/phase-NN.md
RELEASE_QUALIFICATION.md
```

## 8. Orchestration mandate (session rules)

1. Heavy jobs → monitored background tasks (never multi-minute foreground block).
2. Poll via `/farm/status` + harness monitor tooling — no sleep-loop greps.
3. Concurrent work while jobs run; commit timestamps prove it.
4. Fan-out independent streams; spot-verify ≥1 result per fan-out.
5. Kill obsolete batches promptly; reap children; clean partials.
6. Zero orphans at session end (process + port check pasted).
7. Every phase report carries a workstream ledger.

## 9. Matrix dimensions (from baseline inventory)

| Dimension | Values available on this host at Phase 1 |
|---|---|
| Engines | `platform` (available); `piper`/`kokoro`/`expressive` pending install |
| Languages | `en`, `pt-BR` |
| Pause profiles | `audiobook`, `podcast`, `news` |
| Content types | see corpus table |

Farm expands matrix against **actually available** engines at run time so a
missing optional engine does not hard-fail the whole campaign; the report
states which cells were skipped and why.
