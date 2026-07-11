# Phase 2 — FIX MARATHON I: UNREACHABLE + BROKEN

**Status:** COMPLETE  
**Finding:** After Phase 1 spot-checks, **zero features remained BROKEN or UNREACHABLE**.

## Kokoro settlement (definitive)

| Check | Result |
|-------|--------|
| Selectable `engine=kokoro` | YES |
| `/tts/engines` available | YES when models installed |
| Audio out | YES (spot-kokoro.wav WAVE 48kHz) |
| Formal descope | NOT needed |

### Engines honesty fix

Kokoro previously advertised `languages: ["en","pt-BR"]` with `pt-BR: 0`.  
Now languages list only those with voices:

```
kokoro → ['en']  {en:10, pt-BR:0}
piper  → ['en','pt-BR']
platform → ['en','pt-BR']
```

## Workstream ledger

| Workstream | Outcome |
|------------|---------|
| Severity sort of FEATURE_TRUTH | No BROKEN/UNREACHABLE rows after correction |
| Engines honesty | landed + runtime verified |
| Re-probe Kokoro | WORKING |

## Review Loop v2

- BUILD clean, TEST 222 pass, LINT clean on touched files
- Runtime: engines endpoint honesty pasted above
- Commit: fix(v2): phase 2 engines honesty + kokoro settlement
