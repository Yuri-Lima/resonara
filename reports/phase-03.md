# Phase 3 — Pause probe harness

## Deliverables
- `scripts/pause-probe.js` — synthesize or measure WAV, score boundaries
- `npm run probe:pauses` / `probe:all` / `probe:self-test`
- Synthetic self-test: constructed silence measured ±20ms (200/500/850/1100 PASS)
- Unit tests in `src/tts/pause/*.spec.ts` for profiles, assembly, micro-pauses

## Scoring model
- Intentional inserts (structural + micro + sentence splits) → known-gap ms
- silencedetect fallback for residual engine gaps
- Profile-scaled bands for podcast (×0.8) and news (×0.65)

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| self-test | validate measurement math | 4/4 PASS ±20ms |
| probe unit tests | profiles/assembly/micro | 30 pause tests green |

## Adversarial findings
1. Continuous silence merges pre-header+header into one region — score known inserts by type.
2. Race on parallel `--all` overwriting pause-report.json — per-cell JSON then merge.
3. Empty piper micro-segments throw wave.Error — insertSilence fallback.

## Review loop
`npm run probe:self-test` green; pause Jest suite green.
