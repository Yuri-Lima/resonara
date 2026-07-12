# Voice Direction User Guide

## Styles

| Style | When | Default engine bias |
|-------|------|---------------------|
| narrative | Audiobook chapters | expressive (if pack) → kokoro → piper |
| conversational | Dialogue-heavy | expressive |
| newscast | News, announcements | **piper** (flat is correct) |
| animated | Children's stories | expressive |

## Auto-direction

Off by default. Enable with `--auto-direct` (CLI) or `autoDirect: true` (API).

Maps attribution verbs (en + pt-BR) to REM:
- *whispered* / *sussurrou* → quiet, calm
- *shouted* / *gritou* → louder, anger intensity
- *said flatly* / *sem emoção* → neutral low intensity

## Character casting

Persistent per-book table: each speaker → voice + style. Auto-proposed from dialogue analysis; user-overridable in the casting panel. Narrator stays distinct. Consistency: same character in chapter 1 and 12 resolves to the same voice+style.

## Cloning ethics

Voice cloning (if engine supports it) requires explicit consent affirmation that the user holds rights to the reference audio. Cloning real people for demos is forbidden.

## Product path (wired)

API fields that **must** affect audio (not scaffolding):

| Field | Effect |
|-------|--------|
| `exaggeration` (0..1) | Passed to Chatterbox full model (`synthesizeWithExpressive`) |
| `autoDirect` | Injects REM from attribution / style profile |
| `humanize` | Injects `[breath]` markers + post-synth **directed AF** (`directedAudioFilter`) |
| `styleProfile` | Maps to REM style + default affect bucket |
| REM `{emotion:…}` / `{style:…}` | Per-segment exaggeration + affect; multi-emotion docs use `multiControl` |

Job metadata stores `expression` (`exaggeration`, `affect`, `humanize`, `segments`) so resynth/debug can see what was applied.

## Limitations (honest)

- Expressive Pack is an **optional download** (multi-GB); installer size unchanged.
- Long-form RTF may be 2–10× real-time on Apple Silicon — background job with progress.
- pt-BR on expressive tier: Chatterbox Multilingual pack when installed; otherwise REM degrades on Piper/Kokoro pt-BR voices.
- Interactive preview uses Kokoro/Piper; expressive is the performance path.
- **Gate 2 bench scores** historically used offline `directed-final` WAVs built with the same AF graphs; re-certify against live `engine=expressive&humanize=true` jobs after pipeline changes.
