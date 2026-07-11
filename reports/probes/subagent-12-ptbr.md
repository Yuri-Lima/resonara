# Probe: pt-BR pipeline (voice + formatter + travessão)

**Feature:** pt-BR TTS pipeline  
**Verdict:** PARTIAL  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:17:00.000Z  
**Server:** http://127.0.0.1:3848  
**Agent:** subagent-12

## Summary

pt-BR synthesis selects the correct Piper Faber voice and produces downloadable audio. Unit tests for `pt-br.formatter` and `dialogue-parser` all pass. **Formatter expansion works only on the non-dialogue path.** When travessão dialogue is present (or `dialogue: true`), `expandTextForLanguage` is skipped, so dates/`R$` are spoken unexpanded. Travessão parsing runs and splits speakers, but post-dialogue narration can merge into the last character block.

## Checklist

| Step | Result |
|------|--------|
| 1. POST `/tts/synthesize` language=pt-BR with dates, R$, travessão | completed |
| 2. Engine/voice pt-BR appropriate (piper faber) | `piper:pt_BR-faber-medium` |
| 3. Download audio size > 1KB | **1,619,266 bytes** WAV |
| 4. Jest `pt-br.formatter.spec.ts` + `dialogue-parser.spec.ts` | **12/12 pass** |
| 5. Formatter expansion in combined dialogue job | **FAIL** (skipped when dialogue) |
| 6. Travessão dialogue path | **WORKS** (3 blocks + gaps; attribution → maria/joão) |

## Evidence

### Engines / voices

```
GET /tts/engines → piper available, voiceCountByLanguage.pt-BR = 1
GET /tts/voices?language=pt-BR → piper:pt_BR-faber-medium + 10 platform pt-BR voices
Model on disk: resources/piper/models/pt_BR-faber-medium.onnx
```

### Synthesis A — combined probe (dates + R$ + travessão + dialogue:true)

**Request text:**

```
No dia 25/12/2025 o valor total foi R$ 1.234,56.

— Você acha que vai chover? — perguntou Maria.
— Acho que sim — respondeu João.
O silêncio tomou conta da sala.
```

**POST** `/tts/synthesize` `{ language: "pt-BR", engine: "piper", dialogue: true, format: "wav" }`

```
id:        f733f90f-b6b4-4a83-a6d7-c4de5a3aba58
status:    completed
engine:    piper
voice:     piper:pt_BR-faber-medium
metadata.language: pt-BR
metadata.dialogue: true
chunkCount: 3
duration:  11.24s
download:  /tts/jobs/f733f90f-.../download
```

**Audio:**

```
reports/probes/fixtures/ptbr-faber.wav
size: 1619266 bytes (> 1KB)
file: RIFF WAVE audio, mono 48000 Hz
```

**Work dir proves dialogue path** (inter-speaker gaps):

```
dlg-0-raw.wav / dlg-0-trim.wav / dlg-0-gap.wav
dlg-1-raw.wav / dlg-1-trim.wav / dlg-1-gap.wav
dlg-2-raw.wav / dlg-2-trim.wav
dlg-concat.wav → speech.wav
```

**wordTimestamps still contain raw tokens** (formatter not applied):

```
"25/12/2025", "R$", "1.234,56.", "—", "Você", ...
```

(no "vinte e cinco de dezembro", no "reais")

### Synthesis B — language-only auto voice (no engine)

```
POST language=pt-BR (no engine)
→ voice=piper:pt_BR-faber-medium engine=piper status=completed
```

Voice manager correctly prefers Piper Faber over English Kokoro for pt-BR.

### Synthesis C — formatter path without dialogue

```
POST text="No dia 25/12/2025 o valor total foi R$ 1.234,56."
     language=pt-BR dialogue=false engine=piper
id: 315b0632-0ca5-47d1-b7a4-3cf48ef4e90c
status: completed
voice: piper:pt_BR-faber-medium
wordTimestamps:
  No dia vinte e cinco de dezembro de dois mil e vinte e cinco
  o valor total foi mil e duzentos e trinta e quatro reais e
  cinquenta e seis centavos.
has expanded reais? True
has raw R$? False
```

### Offline formatter proof

```js
expandTextForLanguage(text, "pt-BR")
// → "No dia vinte e cinco de dezembro de dois mil e vinte e cinco
//     o valor total foi mil e duzentos e trinta e quatro reais e
//     cinquenta e seis centavos. …"
```

### Offline travessão parse

```js
parseDialogue(text) // emDash default true
// blocks:
//  narrator: "No dia 25/12/2025 o valor total foi R$ 1.234,56."
//  maria:    "Você acha que vai chover?"
//  joão:     "Acho que sim\nO silêncio tomou conta da sala."  ← narration leaked
// speakers: ["narrator","maria","joão"]
```

Attribution stripping works; blank-line narration after a turn stays on the character speaker.

### Jest

```
npx jest src/tts/language/pt-br.formatter.spec.ts src/tts/dialogue-parser.spec.ts --no-coverage

PASS src/tts/language/pt-br.formatter.spec.ts
PASS src/tts/dialogue-parser.spec.ts
Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
```

## Root cause (gaps)

### Gap 1 — formatter skipped when dialogue is on (primary)

`src/tts/tts.service.ts` ~365–382:

```ts
if (!dialogue && plan.mode === 'single') {
  text = expandTextForLanguage(text, primaryLang);
  // + pronunciation dictionary
}
```

Any job with travessão markup auto-sets `dialogue=true` via `hasDialogueMarkup`, so dates/currency never expand.  
`synthesizeDialogue()` also never calls `expandTextForLanguage` per block (only pronunciation without language).

### Gap 2 — narration after travessão merges into last speaker

`dialogue-parser.ts`: after an em-dash line, `buf` still holds spoken text; a following blank + narration line does not flush/reset to `narrator`, so prose is appended to the character turn.

### Gap 3 — dialogue pronunciation language omitted

```ts
// synthesizeDialogue
pieceText = await this.pronunciation.applyDictionary(pieceText, opts.engine);
// missing primaryLang → pt-BR dictionary entries may not apply
```

### Non-gaps (working)

- Piper `pt_BR-faber-medium` default for pt-BR (auto + explicit)
- Platform also exposes 10 pt-BR system voices
- Unit-level currency/date/ordinal/CPF expansion
- Em-dash detection (`hasDialogueMarkup('— Você vem?')`)
- Inter-speaker silence gaps from pause profile

## Fix estimate: S

1. Expand + pronounce **per dialogue block** in `synthesizeDialogue` (or expand full text before parse, then re-parse carefully).  
2. On blank/narration lines after em-dash, always flush and set `currentSpeaker = defaultSpeaker`.  
3. Pass `language` into `applyDictionary` on the dialogue path.  
4. Optional: add e2e covering combined pt-BR text (date + R$ + travessão).

~1–2 hours.

## Verdict rationale

Not **WORKING**: combined probe (the realistic book-like input) fails formatter expansion.  
Not **BROKEN**: voice, audio, unit tests, standalone formatter, and travessão synthesis path all succeed.

→ **PARTIAL**
