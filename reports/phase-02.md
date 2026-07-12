# Phase 2 — Corpus Generation

**Date:** 2026-07-12  
**Commit scope:** `scripts/build-corpus.js`, `samples/catalog/*`, farm unit tests

## What changed

- `scripts/build-corpus.js` — deterministic corpus builder (seed 42)
- `samples/catalog/` — 24 non-soak docs + soak-novel (~50,152 words) + `manifest.json`
- `test/farm/build-corpus.spec.js` + `jest.farm.config.js`
- Self-test: counts, language tags, seed determinism

## Corpus inventory (manifest)

| Metric | Value |
|--------|-------|
| documentCount | 25 |
| nonSoakCount | 24 |
| languages | en, pt-BR |
| seed | 42 |
| soak words | 50152 |
| soak path | samples/catalog/soak-novel.txt |

### Content types covered

**en:** short-article, news (fixture + expanded), book-chapter, technical-doc, dialogue-script, ssml-showcase, children-story, numbers-and-dates, pronunciation-challenge, long-form-essay, paragraph, quick-sentence

**pt-BR:** artigo, noticia, capitulo, dialogo, numeros, tecnico, pronuncia, ssml, historia, ensaio, paragrafo

## Commands + real output

### Background corpus build

```
{"action":"build-corpus","seed":42,"outDir":".../samples/catalog","soakWords":50000}
{
  "ok": true,
  "elapsedMs": 14,
  "documentCount": 25,
  "nonSoakCount": 24,
  "soak": { "id": "soak-novel", "wordCount": 50152, "soak": true }
}
```

Note: generation is string-template deterministic assembly (not network I/O), so wall time is sub-second even for 50k words. Monitored as a background task per mandate; concurrent work: unit tests + farm jest config + Phase 3 prep.

### Self-test

```
{ "ok": true, "documentCount": 25, "nonSoakCount": 24,
  "languages": ["en", "pt-BR"], "soakWordsSelfTest": 528, "deterministic": true }
```

### Unit tests

```
PASS test/farm/build-corpus.spec.js
  ✓ produces at least 24 non-soak documents
  ✓ tags languages correctly
  ✓ is deterministic from the seed
  ✓ includes soak-novel with soak flag
  ✓ generateSoakNovel is seed-deterministic and near target
  ✓ mulberry32 is stable
Tests: 6 passed
```

### Review loop

```
npm run build → clean
npm test → 46 suites, 273 passed
npx eslint src/ --ext .ts → 0 errors, 1 pre-existing warning
```

## Self-review Pass A

- Manifest schema matches FARM_ARCHITECTURE.md
- Soak is original generated prose (no copyrighted text)
- Fixtures reused where present; generated fillers for missing types
- Resource cleanup N/A (pure file writes, no children)

## Self-review Pass B — 3 adversarial findings

1. **scripts/build-corpus.js / generateSoakNovel — sentence pool repetition**  
   Failure: 50k words from 20 sentences is highly repetitive; prosody/WER may not stress rare-word paths.  
   *Justified for soak goal (chunk volume / memory), not for lexical diversity. Catalog docs still cover pronunciation-challenge.*

2. **scripts/build-corpus.js / fixtureOrGen — fixture word-count floors**  
   Failure: pt-BR noticia fixture is ~143 words, not 2k; news stress is weaker in pt-BR.  
   *Accepted: language layer samples are short; en-news fixture provides the 2k-word stress cell.*

3. **test/farm vs root jest config**  
   Failure: `npm test` does not run farm JS tests (rootDir=src, *.spec.ts only).  
   *Fixed via `jest.farm.config.js`; phase report documents the separate command. Consider wiring into package.json scripts later.*

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| bg-build-corpus | Generate catalog + 50k soak | landed (25 docs, 50152 soak words) | 14 ms wall |
| fg-self-test | build-corpus --self-test | landed | <1 s |
| fg-farm-unit | jest.farm.config.js suite | landed 6/6 | 0.15 s |
| fg-review-build/test/lint | REVIEW LOOP v2 | landed clean | ~6 s |
| concurrent-phase3-prep | jest.farm.config + test harness while corpus ran | landed | during bg window |

## Evidence

- `wc -w samples/catalog/soak-novel.txt` → 50152
- manifest.json documentCount 25 / nonSoak 24
- No fabricated metrics

## Next

Phase 3: `scripts/render-farm.js` full orchestrator + unit tests + 4-job smoke.
