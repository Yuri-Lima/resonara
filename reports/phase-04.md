# Phase 4 Report — Engine #4 Integration (Expressive Tier)

**Date:** 2026-07-12  
**Winner:** Chatterbox Turbo via `src/tts/expressive-tts.ts` + `tools/expressive/synthesize.py`

## Build / test / lint

```
npm run build → clean
npm test → 50 suites, 271 passed (incl. expressive-tts.spec + rem-parser.spec)
eslint on modified TTS paths → clean
```

## Delivered

| Piece | Path |
|-------|------|
| Adapter | `src/tts/expressive-tts.ts` — listVoices/synthesize/isAvailable/getVersion |
| Specs | `src/tts/expressive-tts.spec.ts` — caps, fallback chain, consent gate |
| Sidecar | `tools/expressive/synthesize.py` — MPS/CPU, default_ref ≥8s speech |
| Pack download | `scripts/download-expressive-pack.js` |
| Routing | voice-manager engines() + resolveEngine('expressive') |
| Chunker | EXPRESSIVE_MAX_CHARS=280 |
| Fallback | expressive → kokoro → piper → platform (same language) |
| API | engine=expressive + autoDirect/rem/exaggeration/humanize/cloneConsent |

## Capability flags

```
{ paralinguisticTags: true, emotionControl: true, cloning: true, streaming: false }
```

Cloning requires `cloneConsent=true`.

## Adversarial findings (3)

1. **expressive-tts synthesizeOneRaw**: exaggeration hard-coded 0.55 — job-level exaggeration not yet plumbed into raw path → justified for Phase 4 smoke; Phase 14 style controls wire through.
2. **REM compile in startLongForm**: flattens segments to text-only (drops native tags for expressive) — **partial**: tags need segment-aware assembly in Phase 7; current path still strips literal tags for non-expressive (zero leak goal).
3. **isExpressivePackReady**: marker file only — does not checksum weights → download script writes `.pack-ready` after HF fetch; weights live in HF cache (honest offline-after-first-download).

## Workstream ledger

| Task | Outcome |
|------|---------|
| Adapter + tests | landed |
| Pack script | landed |
| Voice manager dual-type bug | fixed |
| Chatterbox full fixture set | collected (death/picnic/dialogue/newscast) |

## Audio smoke

Raw tier renders present under `bench/candidates/chatterbox/`. Pause-probe on expressive deferred to after directed path (Gate 1).
