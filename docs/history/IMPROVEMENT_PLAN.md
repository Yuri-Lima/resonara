# Resonara TTS Improvement Plan

**Product:** Resonara — Shape sound. Speak the long form. Play freely.  
**Scope:** Transform platform-native TTS into a best-in-class offline neural text-to-voice engine  
**Date:** 2026-07-09  
**Constraint:** Offline-first. No cloud TTS APIs.

---

## 1. Current TTS Architecture Analysis

### 1.1 Component map (as-is)

| Module | Path | Role | LOC |
|--------|------|------|-----|
| Orchestration | `src/tts/tts.service.ts` | Job lifecycle, chunk→synth→concat | 327 |
| Platform adapters | `src/tts/platform-tts.ts` | macOS `say` / Windows SAPI | 260 |
| Text chunker | `src/tts/text-chunker.ts` | Paragraph/sentence/word split | 144 |
| REST API | `src/tts/tts.controller.ts` | `/voices`, `/synthesize`, `/jobs` | 72 |
| Module wiring | `src/tts/tts.module.ts` | NestJS module | 13 |
| FFmpeg engine | `src/ffmpeg/ffmpeg.service.ts` | Transcode, normalize, waveform, silence, trim | ~961 |
| Binary resolve | `src/ffmpeg/resolve-ffmpeg.ts` | PATH + candidate dirs for GUI apps | 158 |
| Job runner | `src/jobs/job-runner.service.ts` | Persisted Audio Lab jobs (TypeORM) | ~ |
| Gateway | `src/gateway/jobs.gateway.ts` | Socket.IO progress rooms | 49 |
| Entities | `src/entities/*` | Track, TranscodeJob, SamplePack, PianoTake | — |

### 1.2 Pipeline (as-is)

```
POST /tts/synthesize
  → validate text + platform engine available
  → chunkTextForTts(text)          // max 1800 soft / 2400 hard
  → store job in Map<string, TtsJob>  // IN-MEMORY ONLY
  → setImmediate(runJob)
       for each chunk:
         synthesizeChunk() → macOS say AIFF | Win SAPI WAV
         convertToWav (ffmpeg pcm_s16le 22050)
       concat via ffmpeg concat demuxer (-c copy, fallback re-encode)
  → emit websocket progress / completed
```

### 1.3 Weaknesses catalog (with evidence)

| # | Weakness | Evidence | Impact |
|---|----------|----------|--------|
| W1 | Robotic voice quality | `platform-tts.ts` uses OS formant/SAPI voices; no neural prosody | #1 product quality gap |
| W2 | Audible chunk seams | `tts.service.ts` hard-concats independent synths; each chunk resets prosody; no silence trim/crossfade | Clicks/gaps every ~1800 chars |
| W3 | No SSML | Plain string to `say` / `Speak($text)` | No emphasis, breaks, phonemes |
| W4 | Jobs not persisted | `private readonly jobs = new Map()` in `tts.service.ts` L51 | Crash loses 2h audiobook progress |
| W5 | No pronunciation dictionary | No entity/service; only raw text | Technical terms mangled |
| W6 | No chapter/bookmark support | Single `speech.wav` output | Unnavigable long-form |
| W7 | No document import | `SynthesizeDto.text` only | Manual extract from EPUB/PDF/DOCX |
| W8 | TypeScript looseness | `noImplicitAny: false`, `no-explicit-any: off` | Masked type errors |
| W9 | Sparse tests | 6 unit specs for ~5,400 LOC | Untested services/controllers |
| W10 | Linux gap | Platform TTS returns unavailable on Linux | Server/desktop Linux unusable for Voice |

### 1.4 Strengths to preserve

- Dual-mode (lite sql.js + full Postgres/MinIO/BullMQ) — TTS persistence must work in both
- FFmpeg resolve pattern for Electron GUI PATH (`resolve-ffmpeg.ts`) — mirror for Piper
- TranscodeJob persistence pattern — template for TtsJob entity
- Websocket progress rooms (`job:{id}`) — reuse for TTS statuses
- Smoke scripts (`smoke:tts`, `smoke:service`)
- Platform TTS as fallback — never remove

---

## 2. Piper TTS Integration Strategy

### 2.1 Research findings

**Engine:** Piper (rhasspy/piper, MIT) — ONNX neural TTS, faster than real-time on CPU.

**Binary distribution (release `2023.11.14-2`):**
| Platform | Asset |
|----------|-------|
| macOS arm64 | `piper_macos_aarch64.tar.gz` |
| macOS x64 | `piper_macos_x64.tar.gz` |
| Linux x64 | `piper_linux_x86_64.tar.gz` |
| Linux aarch64 | `piper_linux_aarch64.tar.gz` |
| Windows x64 | `piper_windows_amd64.zip` |

**CLI (standalone binary):**
```
echo "Hello" | piper --model voice.onnx --output_file out.wav
echo '{"text":"..."}' | piper --model voice.onnx --json-input --output_file out.wav
```

**Models:** `.onnx` + `.onnx.json` pair. English inventory includes lessac, amy, libritts, ryan, joe, kathleen, etc. at quality tiers `x_low` / `low` / `medium` / `high`. Sample rates typically 16000 or 22050 Hz.

**JSON input fields:** `text` (required), optional `speaker_id` / multi-speaker; phoneme inject via `[[ ipa ]]` in text; limited SSML (`break`, `phoneme`, `sub`) depending on build.

**macOS packaging note (risk):** Official aarch64 tarball may ship x86_64 binary and omit runtime dylibs (`libespeak-ng`, `libonnxruntime`, `libpiper_phonemize`). Mitigation:
1. Prefer download script that verifies arch + dylibs
2. Fall back to `piper-tts` Python wheel or OHF-Voice/piper1-gpl builds
3. Bundle complete `resources/piper/` with binary + dylibs + espeak-ng-data + default model
4. Set `DYLD_LIBRARY_PATH` / `LD_LIBRARY_PATH` next to binary when spawning

### 2.2 Binary resolution (mirror `resolve-ffmpeg.ts`)

Order:
1. `PIPER_PATH` env / config `piper.path`
2. Explicit Electron `process.resourcesPath/piper/piper`
3. Bundled `resources/piper/piper` relative to app root
4. PATH (`which piper`)
5. Candidate dirs: `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, Windows `C:\piper\`

Models dir:
1. `PIPER_MODELS_DIR`
2. Electron resources `piper/models`
3. `~/.resonara/piper/models`
4. `resources/piper/models` in repo

### 2.3 Process lifecycle

```
spawn(piper, ['--model', modelPath, '--output_file', outWav], {
  cwd: piperDir,
  env: { ...process.env, PATH, DYLD_LIBRARY_PATH: piperDir, LD_LIBRARY_PATH: piperDir },
  stdio: ['pipe', 'pipe', 'pipe'],
})
stdin.write(text); stdin.end();
timeout: configurable (default 10 min per chunk)
on crash → reject with stderr slice; cleanup partial WAV
```

Streaming variant: `--output-raw` → pipe stdout PCM for progressive UI (optional Phase 3).

### 2.4 Error handling

| Condition | Behavior |
|-----------|----------|
| Binary missing | `isAvailable()=false`; auto engine falls back to platform |
| Model missing | 400 with clear message + list installed models |
| Process non-zero | Fail job chunk; surface stderr |
| Timeout | kill process group; mark failed |
| Empty text | BadRequest before spawn |
| 0-byte WAV | Treat as failure |

### 2.5 Default voice

Bundle `en_US-lessac-medium` (or smaller `en_US-amy-low` if package size constrained). Document download of additional voices via settings/UI later.

---

## 3. SSML Implementation Plan

### 3.1 Common subset (Resonara SSML)

| Element | Piper | macOS say | Windows SAPI | Strategy |
|---------|-------|-----------|--------------|----------|
| `<speak>` | wrap/strip | wrap/strip | native | Always wrap root |
| `<break time="Nms\|Ns"/>` | SSML / silence insert | `[[slnc N]]` | native | Common |
| `<emphasis level>` | limited / prosody | `[[emph +]]` | native | Degrade gracefully |
| `<prosody rate pitch>` | rate via length_scale / limited | `[[rate N]]` | native | Map rates |
| `<say-as interpret-as>` | limited | expand pre-process | native | Pre-expand for Piper/say |
| `<phoneme alphabet="ipa">` | `[[ ipa ]]` | limited | native IPA/sapi | Common via transform |
| `<sub alias>` | alias text | alias text | native | Common |

### 3.2 Module: `ssml-parser.ts`

1. Parse XML (strict) → AST (`SsmlNode[]`)
2. Validate known elements; strip unknown with warning log
3. Transform:
   - **Piper:** flatten to text with `[[phonemes]]`, inject break tokens or split segments with silence WAV inserts
   - **macOS:** emit `[[rate]]`, `[[volm]]`, `[[emph]]`, `[[slnc]]` embedded commands
   - **Windows:** pass-through sanitized SSML to SAPI `SpeakSsml`
4. Plain text path: wrap in `<speak>` for pipeline uniformity

### 3.3 Chunker SSML rules

- Never split inside an open tag or between tag start/end
- Prefer splits at `</p>` / paragraph boundaries outside markup
- Engine-aware max: Piper 4000, platform 1800

---

## 4. Chunk Concatenation Fix

### 4.1 Three-pronged solution

**A. Engine-aware chunking**
- Piper: `maxChars=4000`, prefer paragraph-only splits (neural prosody across sentences)
- Platform: keep 1800/2400

**B. Silence trim per chunk** (`FfmpegService.trimChunkSilence`)
```
silenceremove=start_periods=1:start_silence=0.03:start_threshold=-50dB,
areverse,
silenceremove=start_periods=1:start_silence=0.03:start_threshold=-50dB,
areverse
```

**C. Crossfade** (`FfmpegService.crossfadeChunks`)
- Pairwise / progressive `acrossfade=d=0.02:c1=tri:c2=tri` (20ms)
- Single chunk: skip crossfade
- Fallback: concat demuxer if acrossfade fails (log warning)

### 4.2 New pipeline

```
text → (SSML parse) → pronunciation dict → chunk (engine-aware)
  → synth per chunk → trim silence → crossfade chain
  → post-process (normalize/highpass/compress) → chapter markers → output
```

### 4.3 A/B verification

Synthesize identical 5,000-word text with hard-concat vs trim+crossfade; assert no audible seams (energy continuity at boundaries via waveform analysis + human smoke).

---

## 5. Job Persistence Migration

### 5.1 Entity `TtsJob` (`src/entities/tts-job.entity.ts`)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| status | enum | queued / chunking / synthesizing / concatenating / normalizing / completed / failed |
| text | text | full input |
| voiceId | text | nullable |
| engine | text | piper / platform / auto |
| format | text | wav / mp3 / m4b |
| rate | float | nullable |
| totalChunks | int | |
| completedChunks | int | |
| progress | int 0–100 | |
| outputKey | text | storage/fs path |
| error | text | nullable |
| metadata | simple-json | duration, sampleRate, wordCount, chunkBoundaries, chapters |
| createdAt / updatedAt | datetime | |
| completedAt | datetime | nullable |

### 5.2 Migration strategy

1. Add entity to TypeORM entities array (lite + full) — `synchronize: true` creates tables
2. Replace `Map` with `@InjectRepository(TtsJob)`
3. Every status transition → `repo.save`
4. `onModuleInit`: find statuses in `chunking|synthesizing|concatenating|normalizing` → mark `failed` with `"interrupted by restart"`
5. GET `/tts/jobs` paginated + status filter; DELETE cleans files

### 5.3 Dual-mode

sql.js + Postgres both support `simple-json` / text enums used by existing TranscodeJob — reuse patterns.

---

## 6. Pronunciation Dictionary Design

### 6.1 Entity `PronunciationEntry`

- `id`, `word` (unique case-insensitive), `phoneme` (IPA), `alias` (plain sub), `engine` (`all|piper|platform`), `language`, timestamps

### 6.2 Lookup integration

`applyDictionary(text, engine)` before chunking:
- Prefer `<phoneme>` when IPA present and engine supports
- Else `<sub alias="...">` or plain alias substitution
- Word-boundary regex, case-insensitive whole words
- Seed: Dr./Mr./vs./etc./e.g./i.e./API/SQL/...

### 6.3 API

CRUD + import/export JSON under `/tts/dictionary`

---

## 7. Chapter / Bookmark Strategy

### 7.1 Sources of structure

1. Document import chapters
2. Explicit markers: Markdown `### Chapter N: Title` or `# `
3. SSML / plain `--- chapter: Title ---` delimiter (optional)

### 7.2 Output

- Per-chapter WAV/MP3 files under job workdir
- Concatenated full file
- Metadata JSON: `{ chapters: [{ title, startTime, endTime, wordCount, file }] }`
- Optional M4B with ffmpeg chapter metadata file

### 7.3 API / UI

- `GET /tts/jobs/:id/chapters`
- `GET /tts/jobs/:id/chapters/:n/download`
- Chapter list click-to-seek in player

---

## 8. Document Import Strategy

| Format | Library | Chapter detection |
|--------|---------|-------------------|
| EPUB | `epub2` / custom zip+HTML | spine items / nav |
| PDF | `pdf-parse` | "Chapter N" / heading heuristics |
| DOCX | `mammoth` | h1/h2/h3 |
| Markdown | `marked` + strip | ATX headings |

Return shape:
```ts
{ title: string; chapters: { title: string; text: string }[]; totalWords: number }
```

Multipart upload on `POST /tts/synthesize` (or dedicated `/tts/import`).

---

## 9. TypeScript Hardening Plan

1. `tsconfig.json`: `noImplicitAny`, `strictBindCallApply`, `forceConsistentCasingInFileNames`, `noFallthroughCasesInSwitch` → true
2. ESLint: `@typescript-eslint/no-explicit-any: warn` (then zero warnings)
3. Fix hotspots methodically:
   - fluent-ffmpeg callbacks → typed wrappers
   - Socket.IO payloads → event interfaces
   - TypeORM where clauses
   - Multer `Express.Multer.File`
   - Config interface
4. Ban `@ts-ignore` / `@ts-expect-error`

---

## 10. Test Expansion Plan (target ≥80% lines)

### 10.1 Existing specs (6)
- magic-bytes, concurrency, ffmpeg.service, resolve-ffmpeg, platform-tts, text-chunker

### 10.2 New coverage targets
- `tts.service` persistence lifecycle, interrupt recovery
- `piper-tts`, `voice-manager`, `ssml-parser`, `pronunciation.service`
- `document-extractor` (fixtures for md/docx; mock pdf/epub)
- `trimChunkSilence`, `crossfadeChunks`, post-process chain
- Controllers (tts, tracks, jobs, health, piano) via Nest testing
- storage, queue, gateway, job-runner (mocked deps)
- Integration: full TTS pipeline with mocked Piper when binary absent; real when present

### 10.3 Coverage gate
`npm run test:cov` → statements/lines ≥ 80% for `src/tts/**` and overall project ≥ 80% where practical; prioritize new TTS modules at 90%+.

---

## 11. Phased Delivery & Risk Assessment

| Phase | Deliverable | Risk | Mitigation |
|-------|-------------|------|------------|
| 1 | This plan | Low | Research complete |
| 2 | Job persistence | Medium — sql.js JSON enums | Mirror TranscodeJob patterns |
| 3 | Piper engine | **High** — binary/dylib/macOS | Fallback platform; download script; env overrides |
| 4 | Seam fix | Medium — acrossfade edge cases | Fallback concat; unit tests on filters |
| 5 | SSML | Medium — engine subset variance | Graceful degrade + warnings |
| 6 | Dictionary | Low | Simple entity + regex |
| 7 | Document import | Medium — dep size/native | Prefer pure-JS parsers |
| 8 | Chapters | Low–Medium | Metadata + optional M4B |
| 9 | Post-process | Low | Reuse loudnorm |
| 10 | Strict TS | **High** — many errors | Methodical fix, no config loosen |
| 11 | Coverage 80% | Medium — time | Focus TTS + critical services |
| 12 | UI | Low | Vanilla HTML extensions |
| 13 | Electron bundle | Medium — binary perms/signing | extraResources + chmod |
| 14 | Audit + PR | Low | Final smoke |

### Global risks
- **Piper macOS packaging incomplete** → document + multi-source resolve
- **Disk for long audiobooks** → stream/cleanup intermediate parts
- **Do not break Audio Lab / Piano** → shared-code changes only for strict TS / ffmpeg helpers

---

## 12. Success Criteria

- [ ] IMPROVEMENT_PLAN.md committed before implementation
- [ ] Piper primary, platform fallback
- [ ] Zero audible seams on 5,000-word synth (trim + crossfade)
- [ ] SSML common subset + engine transforms
- [ ] TTS jobs survive crash/restart (DB)
- [ ] Pronunciation dictionary CRUD
- [ ] Document import EPUB/PDF/DOCX/MD + chapters
- [ ] Chapter markers in output/API/UI
- [ ] Post-process: normalize + highpass + optional compress
- [ ] TypeScript strict (noImplicitAny, zero @ts-ignore)
- [ ] Test coverage 80%+
- [ ] UI: preview, SSML editor, upload, chapters, dictionary
- [ ] Piper bundled for Electron
- [ ] `ui/deliverable/` dashboard + `make ui` opens browser
- [ ] PR via `gh pr create` (no push of intermediate commits forced; local only until PR)

---

## 13. Implementation Notes for Agents

1. Follow REVIEW LOOP after every phase: build → test → lint → self-review → smoke → commit.
2. Commit format: `feat(scope):` / `fix(scope):` — one phase per commit.
3. Do not push; PR only at end.
4. Keep dual-mode architecture intact.
5. Offline-first: no cloud TTS.

---

*End of Phase 1 research deliverable.*
