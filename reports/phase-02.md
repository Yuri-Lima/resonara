# Phase 2 Report — Expressiveness Baseline

## Build / test / lint

```
npm run build  → clean
npm test       → 25 expression tests PASS; voice-manager fixed for expressive mock
eslint expression + expressive-tts → 0 errors (1 unused warning removed)
```

## Deliverables

- `samples/expressive/**` fixture set (en + pt-BR)
- `scripts/prosody-metrics.js` + self-test PASS (±5% F0)
- `scripts/render-expressive-fixtures.js`
- `bench/baseline/{piper,kokoro,platform}/*`
- `bench/metrics/baseline-*.json`
- `EXPRESSIVENESS_BASELINE.md`

## Headline finding

Piper death-scene F0 var **2318.85** vs picnic **2300.72** (ratio **1.008**) — flat affect proven.

## Adversarial 3

1. **prosody-metrics.js / pyin / failure:** Noisy or unvoiced TTS may yield null F0 → diversity falls back to global var. **Mitigation:** metrics report `voicedFraction`; gates skip null-F0 clips.
2. **render-expressive-fixtures.js / kokoro CLI / failure:** Flag mismatch `--output` vs `--out` broke first fleet. **Fixed** to `--out`.
3. **baseline / platform / failure:** macOS say is not a product default; included only for reference. **Justified** as optional third column.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| ws-p2-piper-dl | download-piper.js | landed | ~3 min |
| ws-p2-kokoro-dl | download-kokoro.js | landed | ~44 s |
| ws-p2-prosody-venv | librosa venv | landed | ~13 s |
| ws-p2-render-piper | fixture fleet | landed 9/9 | ~11 s |
| ws-p2-render-kokoro | fixture fleet | landed 9/9 (after flag fix) | ~39 s |
| ws-p2-render-platform | fixture fleet | landed 9/9 | ~30 s |
| ws-p2-metrics | prosody sweep | landed | ~9 s |

## Audio smoke

Listened (metrics + duration): death/picnic nearly identical duration (~24–25s) and F0; no affect difference — matches baseline claim.
