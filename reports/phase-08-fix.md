# Phase 8 Fix — Matrix Piper Label Honesty

**Date:** 2026-07-12  
**Status:** COMPLETE  
**Branch:** `g30-release-qualification-farm` (PR #19)  
**Verdict on corrected data:** **GO** (real Piper on all 18 piper cells)

## Defect

Three matrix cells whose ids are `en-numbers-and-dates__piper__{audiobook,podcast,news}` **FAILED** under Piper mid-batch (transient sqljs DB corruption — **not** a Piper capability limit). Catalog had already rendered `en-numbers-and-dates` with Piper successfully (`farm-output/catalog/state.json` status=ok, ~5.6 MB).

On retry they were re-rendered with `engine="platform"` but kept the piper id/filename/label:

| Source | What it recorded |
|--------|------------------|
| `farm-output/matrix/log.jsonl` | `engine="piper"`, `retryEngine="platform"` |
| `farm-output/matrix-retry/manifest.json` | `engine="platform"` under piper cell ids |
| `farm-output/metrics/matrix-metrics.json` (before fix) | dropped `retryEngine`; reported `engine="piper"` with WER **byte-identical** to platform twins |
| `byEngine.piper` | n=18 included those 3 platform renders |

Because invalid-audio is a hard-zero gate, matrix **GO** (36/36 valid) was only reachable via this substitution.

## Reproduce → fix → pin loop

### 1. Reproduce (clean Piper re-render)

```
$ bash scripts/farm-stop.sh   # reap ports 3860/3861/3847 + farm workers
$ file ~/.resonara/data/resonara.db
  SQLite 3.x database ...
$ sqlite3 ~/.resonara/data/resonara.db "PRAGMA integrity_check;"
  ok
```

Manifest `farm-output/matrix-piper-rerender/manifest.json`: 3 jobs, **engine=piper only** (no platform fallback), concurrency=1.

Monitored background farm:

```
$ node scripts/render-farm.js run --manifest farm-output/matrix-piper-rerender/manifest.json --concurrency 1
# health: piper.available=true
# COMPLETE 3/3 failed=0  (~36s wall)
```

### 2. Proof: actual Piper WAVs (not platform twins)

From `farm-output/matrix-piper-rerender/proof.json`:

| Cell | engine | bytes | valid WAV | sha64k ≠ platform twin |
|------|--------|------:|:---------:|:----------------------:|
| en-numbers-and-dates__piper__audiobook | piper | 5,694,916 | yes | yes (585c26ba… vs 3c980e4c…) |
| en-numbers-and-dates__piper__podcast | piper | 5,600,782 | yes | yes (e4257a98… vs 5bba9c07…) |
| en-numbers-and-dates__piper__news | piper | 5,466,376 | yes | yes (c3493161… vs ec1206cf…) |

Platform twins remain ~5.74–5.76 MB; Piper re-renders are smaller and content-hash distinct. **No platform substitution under a piper label.**

### 3. Aggregator fix (`scripts/farm-measure.js`)

- Added `resolveActualEngine(jobMeta)`: prefers `retryEngine` → `actualEngine` → `engine`; **never** parses job id/filename.
- `aggregateRows` / `measureOne` / batch jobList all key `engine` through that resolver.
- When `log.jsonl` carries `retryEngine`, it is merged into job meta before measure.
- Regression unit test (`test/farm/farm-measure.spec.js`):
  - id `x__piper__y` + `engine=platform` aggregates under **platform**, not piper
  - id with `engine=piper` + `retryEngine=platform` also under **platform**

### 4. Re-measure + regenerate

```
$ node scripts/farm-measure.js --batch matrix --concurrency 3
$ node scripts/farm-gate.js --metrics farm-output/metrics/matrix-metrics.json
$ node scripts/build-dashboard-data.js
```

Regenerated: `farm-output/metrics/matrix-metrics.{json,md}`, `reports/matrix-recommendations.json`, `reports/matrix-metrics.*`, `RELEASE_QUALIFICATION.md` matrix table, `ui/deliverable/data.js` (byEngine / heatmap).

### 5. Gate verdict (honest)

```json
{
  "verdict": "GO",
  "findings": [],
  "aggregates": {
    "total": 36,
    "measured": 36,
    "failed": 0,
    "meanWer": 0.1149412865951534,
    "meanConformance": 1,
    "meanRtf": 0.4140001452057462,
    "invalidAudio": 0
  }
}
```

**GO stands on real Piper data** for the three numbers cells. No relabeling to force GO.

## Before / after `byEngine.piper`

| | piper.n | piper.meanWer | platform.n | platform.meanWer | matrix meanWer | notes |
|--|--------:|--------------:|-----------:|-----------------:|---------------:|-------|
| **Before** (defect) | 18 | 0.1341 | 18 | 0.0970 | 0.1155 | 3 of 18 “piper” rows were platform WAVs (byte-identical twins) |
| **After** (fix) | 18 | 0.1329 | 18 | 0.0970 | 0.1149 | all 18 piper rows are actual Piper; numbers cells re-rendered |

Note: before-fix `piper.n=18` was **numerically** 18 but **semantically** dishonest (3 platform substitutes). After fix, n=18 is honest Piper. Piper meanWer moved slightly (0.1341 → 0.1329) because the three numbers cells now use real Piper audio (WER 0.247 / 0.243 / 0.237) instead of platform twins (0.250 / 0.249 / 0.249).

### Defect cell detail (after)

| id | engine | WER (proxy) | bytes | valid |
|----|--------|------------:|------:|:-----:|
| en-numbers-and-dates__piper__audiobook | piper | 0.247 | 5694916 | true |
| en-numbers-and-dates__piper__podcast | piper | 0.243 | 5600782 | true |
| en-numbers-and-dates__piper__news | piper | 0.237 | 5466376 | true |

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| p8f-stop | farm-stop reap ports/orphans | landed clear :3860/:3861/:3847 | ~1s |
| p8f-db-preflight | sqlite integrity_check | landed ok | <1s |
| p8f-aggregator-fix | resolveActualEngine + unit test | landed 9/9 farm-measure tests | <1s |
| p8f-piper-rerender | 3-cell engine=piper farm batch | landed COMPLETE 3/3, valid WAVs | ~36s |
| p8f-merge-proof | merge state + sha proof vs platform | landed proof.json | <1s |
| p8f-remeasure | full matrix measure 36 | landed meanWer≈0.115 invalid=0 | ~20s |
| p8f-gate | farm-gate on corrected metrics | landed **GO** | <1s |
| p8f-dashboard | build-dashboard-data.js | landed 36 matrix rows | <1s |
| p8f-rq-docs | RELEASE_QUALIFICATION + this report | landed | <1s |

## Self-review

1. Did not substitute platform under piper labels on re-render.
2. Did not force GO by relabeling — Piper actually passed the numbers cells after clean restart.
3. Aggregator regression pins the id-vs-engine confusion forever.
4. Catalog evidence already showed Piper can render this doc; matrix failure was infra (sqljs), confirmed by clean re-render.

## Evidence paths

- `farm-output/matrix-piper-rerender/{manifest,state,log,run.log,proof}.json`
- `farm-output/matrix/{state.json,log.jsonl,en-numbers-and-dates__piper__*.wav}`
- `farm-output/metrics/matrix-metrics.json` / `gate-matrix.json`
- `reports/phase-08-fix-before-byEngine.json`
- `test/farm/farm-measure.spec.js` (resolveActualEngine cases)
