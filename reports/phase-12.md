# Phase 12 — QA armor

## Probe as regression gate
- `npm run probe:self-test` — synthetic ±20ms
- `npm run probe:pauses` / `probe:all`
- Jest: 30 pause-module tests + full 219 suite green
- Matrix hard target ≥90% — achieved 24/24 cells

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| full jest | no regression | 44 suites / 219 pass |
