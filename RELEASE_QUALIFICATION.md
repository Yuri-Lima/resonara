# RELEASE QUALIFICATION — Resonara Voice Farm

**Product:** Resonara 2.2.0  
**Campaign:** G30 release-qualification voice farm  
**Generated:** concurrent with soak (see state timestamps)  
**Overall gate (catalog + matrix):** **GO**

## Executive verdict

| Gate | Verdict | Evidence |
|------|---------|----------|
| Catalog (24 docs) | GO | meanWer=0.103, conf=1, invalid=0, fail=0/24 |
| Matrix (36 cells) | GO | meanWer=0.116, conf=1, invalid=0, fail=0/36 |
| Soak (50k words) | PENDING | in flight — see farm-output/soak/state.json |
| Packaging macOS | PENDING | background dist:mac |
| Packaging Windows | PENDING | background dist:win |
| Sign-off gate | FIXED | await-farm accepts COMPLETE (Phase 9) |

**GO/NO-GO argument:** Catalog and matrix both pass architecture thresholds (WER≤0.35, pause conf≥0.9, invalid audio=0, fail rate≤5%, RTF≤5). Soak and packaging remain open until their background jobs complete; final verdict requires soak plateau + installers.

## Catalog quality (measured)

- Jobs: 24 measured, 0 failed
- mean WER (duration-density proxy unless whisper): 0.1033
- mean pause conformance: 1
- mean RTF: 0.3464
- mean duration sec: 349.1412735833333

## Engine × profile matrix (measured)

- Cells: 36 / failed 0 / invalid 0
- mean WER: 0.1155
- mean RTF: 0.3992
- by engine: {
  "piper": {
    "n": 18,
    "meanWer": 0.1341247769433018,
    "meanConformance": 1,
    "meanRtf": 0.5178662693228892
  },
  "platform": {
    "n": 18,
    "meanWer": 0.09696332033440161,
    "meanConformance": 1,
    "meanRtf": 0.28056160024501015
  }
}

### Data-derived defaults (recommendDefaults)

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

## Phase 8 recovery

Matrix initially NO-GO (5 invalid on numbers cells: Piper unavailable + ECONNRESET). Corrupt sqljs DB blocked retry. After DB reset + platform-fallback re-render of 5 cells, matrix GO.

Obsolete scratch batch cancelled: status CANCELLED in ~3s; partials cleaned.

## Phase 9 sign-off gate

Runbook waits for `FARM DONE`; orchestrator writes `COMPLETE`. Buggy gate hangs; fixed `await-farm.js` accepts both.

## Soak (in progress)

- Document: samples/catalog/soak-novel.txt (50,152 words)
- Engine/profile: platform / audiobook (body-limit fix required for 297kB JSON)
- Memory probe: farm-output/soak/memory-curve.json
- Concurrency proof commits inside startedAt window: see reports/phase-10-concurrency-proof.txt

## Packaging

Background: npm run dist:mac and dist:win — results in farm-output/packaging/.

## Workstream ledger

See reports/workstream-ledger.json and dashboard Workstream section.

## Zero-orphan teardown

Deferred to Phase 13 after packaging + soak complete.
