# Pause Architecture

> Design committed before implementation (Phase 2).
> Goal: make pauses **correct, measurable, configurable, and regression-protected**.

## Problem

Seam-elimination (trim both edges + 20ms crossfade on every chunk join) fixed
clicks by **deleting** sentence/paragraph/header silence. The dialogue path's
flat 0.2s gap is the only intentional pause — and it is not boundary-typed.

Baseline (Phase 1): paragraph avg **65–201 ms** vs target **700–1000 ms**;
overall conformance **0–29%**.

## a. Pause map (chunker)

Every `TextChunk` carries:

```ts
pause: {
  endsAt: 'paragraph' | 'sentence' | 'header' | 'chapter'
        | 'dash-clause' | 'dialogue' | 'ssml-break' | 'forced' | 'document-end';
  intraBoundaries: Array<{ offset: number; type: IntraBoundaryType; explicitMs?: number }>;
  isHeader?: boolean;
  headerLevel?: number;
  explicitBreakMs?: number; // SSML <break> replaces profile
}
```

Rules:
- Prefer paragraph → sentence → word splits (unchanged).
- **Never pack across** paragraph / header / chapter / dialogue / ssml-break.
- Never split inside a dash clause or between a header and its first body
  paragraph unless size forces it → mark `forced`.
- Headers: markdown `#`/`##`/`###` **and** plain-text Title Case heuristics.
- pt-BR travessão dialogue lines → `dialogue` / `dialogue-attrib` intra marks.

## b. Assembly redesign

| Boundary | Trim edges? | Join method | Gap source |
|---|---|---|---|
| `forced` | yes (both) | 20ms crossfade | none (seam fix) |
| `sentence` | leading only | concat + silence | profile − engine delta |
| `paragraph` | leading only | concat + silence | profile |
| `header` / `pre-header` | leading only | concat + silence | profile (pre + post) |
| `chapter` | leading only | concat + silence | profile |
| `dialogue` | leading only | concat + silence | profile travessão |
| `ssml-break` | leading only | concat + silence | **explicit ms only** |
| `document-end` | leading only | n/a | none |

**Critical:** when Piper is given `--sentence_silence`, the trimmer must **not**
strip trailing silence on non-forced chunks. Assembly inserts only the
**delta** to the band midpoint to avoid double-pausing.

One ffmpeg concat pass materializes all silence WAVs + audio parts.

## c. Engine layer

| Engine | Sentence gaps | Intra-chunk micro-pauses |
|---|---|---|
| **Piper** | `--sentence_silence` from profile (`piperSentenceSilenceSec`) | Post-synth segment split at comma/dash/ellipsis + insert micro-gap (engine-agnostic; no phoneme clip because we split on punctuation spans, not mid-word). Piper JSON has no break token. |
| **Kokoro** | Measure first; if near-zero, same post-synth micro-gaps | Same as piper |
| **Platform (macOS)** | Natural `say` cadence + `[[slnc N]]` at comma/dash/ellipsis | `[[slnc N]]` embedded commands mapped from profile |
| **Platform (Windows)** | SAPI rate only | Future: SSML `<break>` via System.Speech when available |

Verified: Python `piper-tts` 1.4.2 supports `--sentence_silence` / `--sentence-silence`.

## d. Intra-chunk micro-pauses — choice

**Primary:** mechanism (2) style without full forced-alignment dependency:
split the speakable text at punctuation into sub-utterances, synthesize each,
insert profile micro-silence between (comma/semicolon/colon/em-dash/ellipsis).

**Why not (1) alone:** Piper has no json-input break; SSML is not native.
**Why not alignment-only:** Whisper may be offline; probe uses alignment when
available, synthesis path stays offline-first and deterministic.

macOS path uses mechanism (1): `[[slnc N]]`.

## e. Config schema

```ts
type PauseProfileName = 'audiobook' | 'podcast' | 'news' | 'custom';

interface PauseBand { minMs: number; maxMs: number; insertMs: number; }

interface PauseProfile {
  name: PauseProfileName;
  bands: Record<PauseBoundaryKey, PauseBand>;
  piperSentenceSilenceSec: number;
  jitter?: number; // ± within band for natural feel
}
```

Presets:
- **audiobook** — contract bands (default)
- **podcast** — ~20% tighter
- **news** — ~35% tighter
- **custom** — per-boundary ms overrides

Language overrides: pt-BR longer travessão / dialogueAttrib / paragraph.

Surfaces:
- API: `pauseProfile`, `pauseCustom` on synthesize
- Job metadata: `pauseProfile`, `pauseBands`
- CLI: `--pause-profile`
- UI: profile picker + Advanced sliders + Preview

## f. Risk register

| Risk | Mitigation |
|---|---|
| Seams return at forced splits | Keep trim+crossfade **only** at `forced`; seam fixtures + WER |
| Double-pausing (engine + insert) | Delta insert: `max(0, target − engineSentenceMs)` |
| SSML `<break>` double-count | `endsAt: 'ssml-break'` replaces profile; never sum |
| RTF regression from N silence files | Batch silence gen + single concat demuxer pass; RTF guard ≤10% |
| Robotic uniform gaps | ±8% jitter within band |
| Packing erases paragraph edges | Never pack across structural boundaries |

## Probe contract

A pause is **correct** when measured silence ∈ `[minMs, maxMs]`.
`probe:all` matrix must reach ≥90% conformance. Jest pins two fixtures so
future trim/crossfade changes cannot silently kill pauses again.

## Data flow

```
text → chunker (pause map) → engine (sentence_silence / slnc / micro-splits)
     → boundary-aware trim → assemble (silence | crossfade-forced)
     → post-process → probe (silencedetect ± aligner) → conformance %
```
