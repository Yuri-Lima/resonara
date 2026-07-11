# Pause Tuning Guide

## Profiles

| Profile | Scale vs audiobook | Use when |
|---|---|---|
| **audiobook** | 1.0 | Long-form narration, books, essays |
| **podcast** | ×0.8 | Conversational pacing, tighter breaths |
| **news** | ×0.65 | Dense delivery, shorter gaps |

## Target bands (audiobook, ms)

| Boundary | min | max | insert |
|---|---:|---:|---:|
| comma | 150 | 250 | 200 |
| semicolon / colon | 200 | 300 | 250 |
| em-dash / travessão | 200 | 350 | 275 |
| sentence `.!?` | 350 | 600 | 450 |
| ellipsis | 450 | 750 | 600 |
| paragraph | 700 | 1000 | 850 |
| pre-header | 250 | 400 | 325 |
| header → body | 900 | 1300 | 1100 |
| chapter | 1500 | 2500 | 2000 |
| dialogue / attrib | 250 | 400 | 325 |

pt-BR overrides slightly lengthen travessão and paragraph.

## How to measure

```bash
npm run probe:self-test          # synthetic ±20ms
npm run probe:pauses -- --fixture en-punctuation --engine piper --profile audiobook
npm run probe:all                # full matrix
```

A boundary **passes** when measured silence falls inside the profile band (±15ms encoder tolerance).

## Custom overrides

API / CLI: `pauseProfile: custom` plus per-boundary insert ms (see `resolvePauseProfile`).

## Tuning tips

1. If paragraphs feel long: try `podcast` or lower `paragraph` custom ms.
2. If sentences still rush: raise profile sentence band / ensure micro-pauses enabled.
3. Never re-enable trailing trim on non-forced chunks — that reintroduces this bug.
4. Forced mid-sentence joins keep 20ms crossfade; do not insert silence there (seams).

## Latest matrix

See `reports/pause-report.json` — last full fleet: **24/24 cells ≥90%**, average **97.5%**.
