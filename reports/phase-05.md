# Phase 5 — Engine layer

## Piper
- `--sentence_silence` from active profile (`piperSentenceSilenceSec`)
- Intra-chunk: micro-segment split at comma/dash/ellipsis/**sentence** + insert profile gaps
- Leading-only trim preserves engine trailing silence on non-forced chunks

## Platform (macOS)
- `[[slnc N]]` injected at punctuation from profile
- Documented: Windows SAPI would need SSML `<break>` via System.Speech

## Kokoro
- Same micro-segment path when engine selected (measure-first parity)

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| piper help check | verify --sentence_silence | supported on installed build |
| micro-pause planner | engine-agnostic gaps | landed micro-pauses.ts |

## Adversarial findings
1. Micro-split with full sentence_silence per piece over-pauses — clamp non-last pieces.
2. Empty speakable after stripping markdown → wave header error — silence placeholder.
3. Platform `say -f` required for `[[slnc]]` (stdin strips) — use temp file.

## Review loop
Probe en-punctuation piper audiobook → 100% after sentence micro-gaps.
