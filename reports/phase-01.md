# Phase 1 — Reproduce the pause bug with numbers

## Forensic evidence (verified file:line)

### 1. No `--sentence_silence` in Piper spawn args
Pre-fix `src/tts/piper-tts.ts` ~333: args were `--model`, `--output_file`, `--json-input`, `--speaker`, `--length_scale` only.

### 2. `trimChunkSilence` strips leading AND trailing
`src/ffmpeg/ffmpeg.service.ts` ~966: `silenceremove` + `areverse` twice on every chunk.

### 3. Long-form: synthesize → trim → crossfade(d=0.02)
Pre-fix pipeline crossfaded every join with zero inserted silence.

### 4. Chunk map had no boundary metadata
`TtsChunkMapEntry` lacked `endsAt` / pause map.

### 5. Dialogue path flat 0.2s only
Only speaker-block path inserted silence (0.2s flat).

### 6. Em-dash normalization hopes for a pause
Preprocessor spaces dashes; Piper does not pause on `—`.

### 7. Headers flow into body
Markdown titles synthesized as prose with no pause treatment.

## Fixtures
- `samples/pause-probes/en-punctuation.{txt,json}`
- `samples/pause-probes/en-structure.{md,json}`
- `samples/pause-probes/pt-br-pontuacao.{txt,json}`
- `samples/pause-probes/pt-br-estrutura.{md,json}`

## Baseline (v1.0.0 / pre-fix pipeline)

Source: `reports/pause-baseline.json` + `reports/ab-baseline/`

| fixture | engine | conformance | para avg ms | sentence avg ms |
|---|---|---:|---:|---:|
| en-punctuation | piper | **28.6%** | **65** | **137** |
| en-structure | piper | **3.6%** | **201** | **121** |
| pt-br-pontuacao | piper | **0%** | **71** | **126** |
| pt-br-estrutura | piper | **~4%** | **~180** | **~130** |

**Bug proven:** paragraph/header/sentence gaps near zero after trim+crossfade. A/B WAVs archived under `reports/ab-baseline/`.

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| baseline fleet (8 cells) | piper+platform × 4 fixtures | landed → pause-baseline.json |
| A/B archive | v1.0.0 reference WAVs | landed → reports/ab-baseline/ |

## Adversarial findings
1. **Char-linear time mapping drifts after long silences** — fixed in later probe with known-gap timeline.
2. **Markdown `#`/`---` choke engines** — speakableText strips markers.
3. **Baseline probe could false-pass if window too wide** — tightened noise/window for baseline.

## Review loop
- Build/test deferred to phase commits; baseline scripts pure Node+ffmpeg.
