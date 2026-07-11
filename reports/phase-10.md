# Phase 10 — SSML breaks

## Contract
- `endsAt: 'ssml-break'` + `explicitBreakMs` replaces profile — never summed
- Assembly path in `buildAssemblePlan` inserts exact ms
- Unit test: 800ms explicit → 800ms silence part

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| assemble SSML unit test | exact break | green |
