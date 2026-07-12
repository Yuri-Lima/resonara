# Resonara Expression Markup (REM)

Engine-agnostic direction layer. Compiles to native engine controls or degrades gracefully.

## Directives

| Syntax | Meaning |
|--------|---------|
| `{style: narrative\|conversational\|newscast\|animated}` | Global/local style |
| `{emotion: joy\|sadness\|tension\|calm\|anger\|neutral, intensity: 0..1}` | Affect |
| `{emphasis}word{/emphasis}` | Lexical emphasis |
| `[breath]` `[sigh]` `[laugh]` `[chuckle]` `[cough]` `[gasp]` | Paralinguistic events |
| `[pause:800ms]` | Explicit silence |

## Hard rule

Paralinguistic tags are **never** spoken as words on any engine. Unknown events are dropped with a warning.

## Degradation matrix (feature × engine)

| Feature | expressive | kokoro | piper | platform |
|---------|------------|--------|-------|----------|
| style | native (exaggeration/rate) | approx rate | approx rate | approx rate/pitch |
| emotion | native | approx rate | approx rate | approx rate/pitch |
| emphasis | native/approx | approx | approx | approx |
| breath/sigh | native tags or sample | sample mix −24 dB | sample mix | sample mix |
| laugh | native tag | **drop** | **drop** | drop |
| pause | silence | silence | silence | silence/slnc |
| cloning | consent-gated | drop | drop | drop |

## Compilation

```ts
import { compileRem, parseRem } from './src/tts/expression';
const result = compileRem(text, 'expressive' | 'piper' | 'kokoro' | 'platform');
// result.segments[].speakable — safe for TTS
// result.segments[].exaggeration, .rate — engine knobs
// result.warnings — degradation notices
```

See `src/tts/expression/` and tests in `rem-parser.spec.ts` (literal-tag leak suite).
