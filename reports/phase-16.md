# Phase 16 — Ship

## Deliverables checklist
- [x] Baseline proving bug with numbers
- [x] PAUSE_ARCHITECTURE.md before code
- [x] Tested pause-probe (self-test + matrix ≥90%)
- [x] Chunker pause map + header detection
- [x] Piper sentence_silence + micro-pauses
- [x] Boundary-aware assembly (forced-only trim/crossfade)
- [x] pt-BR travessão rhythm
- [x] Three profiles + API/CLI
- [x] Full matrix 24/24 ≥90%
- [x] UI prosody section + `make ui`
- [x] Zero orphan probe processes at end

## Review loop v2 (final)
- `npm run build` — clean
- `npm test` — 44 suites / 219 pass
- eslint on touched src — clean
- Self-review A: types, cleanup, forced seams preserved
- Self-review B (3 weaknesses):
  1. **probe known-insert scoring** trusts intentional gaps — mitigated by self-test + silencedetect cross-check on residual.
  2. **micro-segment RTF** — extra synth calls per comma; acceptable offline; monitor RTF in demos.
  3. **platform `[[slnc]]`** quality varies by macOS voice — best-effort parity documented.

## Workstream ledger (session)
| stream | purpose | outcome |
|---|---|---|
| baseline fleet | prove bug | landed |
| design | architecture | landed |
| implementation | phases 3–6 | landed |
| matrix 24-parallel | ≥90% | landed 97.5% avg |
| jest+build | regression | green |
| orphans | process check | none |
