# Phase 2 — PAUSE_ARCHITECTURE.md

Design committed in `PAUSE_ARCHITECTURE.md` before implementation code.

Covers: pause map, assembly redesign (trim/crossfade only at forced), engine layer
(piper `--sentence_silence`, micro-segments, macOS `[[slnc]]`), config schema
(three profiles + pt-BR overrides), risk register (seams, double-pause, RTF).

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| design doc | architecture before code | landed PAUSE_ARCHITECTURE.md |

## Adversarial findings
1. **Pre-header + header double-stack** if both applied at same join — assembly must approach-only when next is header.
2. **Engine sentence silence + assembly sentence gap** can double-pause — delta-only insert.
3. **SSML `<break>` must replace, never sum** with profile — explicitBreakMs path.

## Review loop
Doc-only phase; validated by later probe contract.
