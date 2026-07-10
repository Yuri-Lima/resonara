# G25 Forensic Audit Report

**Branch audited:** `feat/tts-neural-longform` (checked out as `feat/tts-multilingual-ptbr`)  
**Preferred over:** `feat/tts-neural-overhaul` — longform has the fuller Piper + multilingual stack  
**Audit date:** 2026-07-10  
**Auditor:** G28 session (Phase 0 / Phase 1)  
**Machine:** macOS arm64 (Darwin, Node v22.14.0)  
**Constraint:** Offline-first Resonara TTS — no cloud APIs for synthesis

This report is the **source of truth** for what actually works on disk right now.
Prior session claims (G25 “phases 1–21 done”) are treated as untrusted until
verified here.

---

## 1. Build / Test / Lint / Coverage Baseline

### 1.1 `npm install`

| Metric | Result |
|--------|--------|
| Status | ✅ Success (`added 1066 packages, audited 1067 packages in 5s`) |
| Peer dependency failures | None |
| Funding notices | 187 packages |
| Vulnerabilities | 31 (3 low, 21 moderate, 7 high) — pre-existing; not fixed in audit |
| Deprecations | inflight, rimraf@2/3, eslint@8, glob@7/10, multer@1, fluent-ffmpeg, uuid@9, boolean@3, @humanwhocodes/* |
| Postinstall | Empty string in package.json (no auto Piper download) |

### 1.2 `npm run build`

| Metric | Result |
|--------|--------|
| Status | ✅ **Clean success** (`nest build`, exit 0) |
| Errors | 0 |
| TypeScript | Compiles with `noImplicitAny: true`, `strictNullChecks: true` |

### 1.3 `npm test`

| Metric | Result |
|--------|--------|
| Test suites | **39 passed**, 39 total |
| Tests | **187 passed**, 1 skipped, **0 failed**, 188 total |
| Time | ~6.6s |

#### Failing tests

**None.** (An older G26 audit listed 3 failures in `text-chunker` / `tts-audio`; those are fixed on this branch.)

Skipped: 1 (environment-gated integration-style unit).

### 1.4 `npx eslint src/ --ext .ts`

| Metric | Result |
|--------|--------|
| Errors | **0** |
| Warnings | **8** (all `@typescript-eslint/no-unused-vars`) |
| Files | `ffmpeg.service.ts` (2), `create-take.dto.ts` (1), `queue.module.ts` (1), `tracks.controller.ts` (2), `tracks.service.ts` (2) |

No G25-introduced lint errors. Warnings are pre-existing Audio Lab / Piano leftovers.

### 1.5 `npm run test:cov`

| Metric | % | Threshold |
|--------|---|-----------|
| Statements | **75.68%** | 80% — **FAIL** |
| Branches | **53.65%** | (no hard fail reported for branch) |
| Functions | **63.94%** | — |
| Lines | **77.48%** | 80% — **FAIL** |

Coverage collection is **narrow** (`collectCoverageFrom` limited to selected TTS/gateway/jobs files). Threshold failure is real against configured scope. Multilingual modules under `src/tts/language/` are **not** all in the coverage collect set.

---

## 2. Feature Inventory

Status legend: ✅ WORKING · ⚠️ PARTIAL · ❌ MISSING · 🔴 BROKEN

| Feature | Status | Evidence |
|---------|--------|----------|
| **IMPROVEMENT_PLAN.md** | ✅ WORKING | ~400 lines at repo root; architecture + Piper strategy. Slightly stale vs current G27/G28 stack. |
| **Sample texts (EN 10)** | ✅ WORKING | All 10 under `samples/texts/`: quick-sentence, paragraph, short-article, news-article, book-chapter, technical-doc, ssml-showcase, dialogue-script, pronunciation-challenge, numbers-and-dates. |
| **Sample texts (pt-BR)** | ⚠️ PARTIAL | 11 files under `samples/texts/pt-br/` including frase-rapida, paragrafo, noticia, capitulo-livro, misturado-en-pt, ssml-demonstracao. Content is shorter than the phase-8 word-count targets (e.g. noticia ~876 bytes vs ~2000 words; documento-tecnico ~738 bytes vs ~3000 words). Usable for demos but not full stress fixtures. |
| **Demo scripts** | ⚠️ PARTIAL | EN + pt-BR npm scripts present (`demo:quick` … `demo:pt:all`, `demo:all-languages`). **Cannot fully smoke-test Piper path until binary + ONNX models are installed** (see Piper). Platform `say` voices exist for fallback. |
| **Piper TTS engine** | 🔴 BROKEN (runtime) | `src/tts/piper-tts.ts` compiles and unit-tests pass. **Runtime:** `isPiperAvailable()` → `{ available: false, detail: "Piper binary not found" }`. `resources/piper/` has Windows DLLs only + model **JSON** sidecars; **no** `piper` macOS binary, **no** `.onnx` weights, **no** `tools/piper-venv`. |
| **Voice Manager** | ⚠️ PARTIAL | Lists Piper + platform + Kokoro; language filter + `getDefaultVoiceForLanguage` exist. **Bug:** `resolveEngine('auto')` prefers Kokoro even for pt-BR (Kokoro is English-only) — fixed on `feat/tts-multilingual-completion` but **not** on this longform tip. |
| **TTS Job Persistence** | ✅ WORKING (code) | `tts-job.entity.ts` + TypeORM. `onModuleInit` marks in-flight jobs FAILED. Dual-mode sql.js / Postgres. Kill/restart not re-run this session (code path present). |
| **SSML Parser** | ✅ WORKING | `ssml-parser.ts` + specs; engine transforms. pt-BR SSML sample exists. |
| **Pronunciation Dictionary** | ✅ WORKING (code) | Entity + service + EN + pt-BR seed entries (Sr., CPF, software→sóftuer, etc.). `applyDictionary(text, engine, language)` filters by language. |
| **Dialogue Parser** | ✅ WORKING (code) | `[speaker]:` tags + Portuguese em-dash (`—`) convention + attribution verbs (perguntou, disse, …). Specs present. |
| **Text Chunker** | ✅ WORKING (code) | Engine-aware sizes (Piper 4000). Language config abbreviations + number-format protection. Specs pass. |
| **Silence Trimming** | ✅ WORKING | `ffmpeg.service.ts` `trimChunkSilence()` at L966. |
| **Crossfade** | ✅ WORKING | `crossfadeChunks()` at L1106; empty-part guards + hard-concat fallback. Unit tests pass. |
| **Streaming Preview** | ✅ WORKING (code) | `jobs.gateway.ts` emits `tts:chunk:ready`. |
| **Timestamp Aligner** | ✅ WORKING (code) | `timestamp-aligner.ts` + WebVTT/SRT specs. |
| **Batch Synthesis** | ✅ WORKING (code) | `tts-batch.entity.ts` + controller batch routes. |
| **Model Manager** | ⚠️ PARTIAL | Registry lists en + pt-BR models (faber, jeff, cadu, edresson). list/download APIs present. **No models downloaded on disk** (JSON only). |
| **Post-processing Pipeline** | ✅ WORKING (code) | Presets podcast / audiobook / raw / custom. |
| **Document Import** | ✅ WORKING (code) | Markdown, HTML, DOCX, PDF, plain; EPUB lighter path. Specs cover MD/HTML/plain. |
| **Chapter Markers + M4B** | ⚠️ PARTIAL | Chapter-aware synthesis present; M4B path exists. Chapter detection intentionally conservative. |
| **Re-synthesis** | ✅ WORKING (code) | Per-chunk resynth endpoint in controller/service. |
| **E2E Tests** | ❌ MISSING | `test/e2e/` **does not exist** on longform tip. Multilingual e2e only on `feat/tts-multilingual-completion`. `test/jest-e2e.json` + integration specs exist. |
| **TypeScript Strict** | ✅ WORKING | `noImplicitAny: true`, `strictNullChecks: true` in `tsconfig.json`. |
| **UI Overhaul** | ⚠️ PARTIAL | `ui/voice/` has voice UI; language selector partially present from prior multilingual work. Needs verification after Piper install. |
| **Accessibility** | ⚠️ PARTIAL | Deliverable claims WCAG AA; not fully audited this phase. |
| **Electron Packaging** | ⚠️ PARTIAL | `desktop/`, electron-builder config, `dist:mac` / `dist:win`, `afterPack.js`, `WINDOWS_TESTING.md` present. **Not runtime-verified this session** (needs models + binary). |
| **Performance Benchmarks** | ⚠️ PARTIAL | `scripts/benchmark.js` + `benchmark:pt` script exist. Not run this audit (needs Piper). |
| **UI Deliverable** | ⚠️ PARTIAL | `ui/deliverable/` exists (app.js, index.html, styles). Multilingual showcase upgrades live on `feat/tts-multilingual-completion` (~1.6k LOC delta) — **not fully merged** here. |
| **Language abstraction** | ✅ WORKING (code) | `src/tts/language/*`: types, en/pt-BR config, formatters, detector, registry, mixed-language synthesizer. Specs pass. |
| **pt-BR formatters** | ✅ WORKING (code) | Currency R$, DD/MM dates, CPF/CNPJ, ordinals — unit tests pass. |
| **Platform pt-BR voices** | ✅ WORKING (host) | This machine has Luciana, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley (`pt_BR`); Joana is `pt_PT`. |
| **Kokoro engine** | ⚠️ PARTIAL | Code present; English-only. Dangerous if auto-selected for pt-BR (see bugs). |

---

## 3. Bugs Found

| # | Severity | Location | Issue | Reproduction |
|---|----------|----------|-------|--------------|
| B1 | **Critical** | `resources/piper/` | No Piper binary / venv / ONNX models on clean checkout | `node -e "require('./dist/tts/piper-tts').isPiperAvailable()"` → available:false |
| B2 | **Critical** | `src/tts/voice-manager.ts` `resolveEngine` | Auto engine prefers Kokoro for **all** languages; Kokoro cannot speak pt-BR | `resolveEngine('auto')` without language → kokoro when available; synthesize Portuguese → wrong/English phonemes or failure |
| B3 | **High** | `src/tts/tts.service.ts` synthesize path | Engine resolved **before** language (on longform tip) | Request language=pt-BR with engine=auto → may bind Kokoro |
| B4 | **Medium** | Coverage config | Statement/line coverage below 80% threshold | `npm run test:cov` exits non-zero |
| B5 | **Medium** | `samples/texts/pt-br/*` | Several fixtures far below specified word counts | `wc -l` / file sizes vs Phase 8 targets |
| B6 | **Low** | ESLint | 8 unused-var warnings (non-TTS modules) | `npx eslint src/ --ext .ts` |
| B7 | **Low** | npm audit | 31 known vulnerabilities in deps | `npm install` summary |

---

## 4. Stubs / Incomplete Implementations

1. **Piper packaging assets** — Windows DLL stubs in `resources/piper/` without matching macOS binary; models are JSON-only placeholders.
2. **`test/e2e/` multilingual suite** — planned; missing on this branch tip.
3. **Deliverable multilingual showcase** — base UI exists; full A/B / packaging matrix from multilingual-completion not fully present.
4. **Coverage gates** — language modules not fully included in `collectCoverageFrom`.
5. **pt-BR sample depth** — short fixtures stand in for multi-thousand-word stress tests.

---

## 5. Features Prior Sessions Claimed Done But Are NOT Runtime-Ready

| Claim | Reality |
|-------|---------|
| “Piper TTS integration complete” | Code yes; **binary + models not on disk** → cannot synthesize |
| “pt-BR models bundled” | Registry + JSON config only; **no `.onnx` weights** |
| “Desktop apps with both languages OOTB” | Packaging scripts exist; **not verified packaged runtime this audit** |
| “E2E multilingual tests” | **Absent** on longform tip |
| “Language-aware engine selection” | Partially implemented; **Kokoro still wins auto for pt-BR** |
| G25 “phases 1–21 done” | Much code landed (chunker, SSML, jobs, demos, language layer) but **runtime path broken without download:piper** |

---

## 6. Recommended Fix Priority

### Critical (block all demos / packaging)
1. Run/fix `npm run download:piper` — install arm64-native binary or Python venv + en_US-lessac-medium + pt_BR-faber-medium ONNX.
2. Port language-aware `resolveEngine(language)` + synthesize-order fix from `feat/tts-multilingual-completion`.
3. Stabilize `demo:quick` and `demo:pt:rapida` end-to-end.

### High (pt-BR expansion depends on these)
4. Expand thin pt-BR fixtures toward phase targets (at least noticia / capitulo / tecnico).
5. Multilingual e2e suite + deliverable showcase merge.
6. Verify platform fallback chain never crosses languages (pt-BR → never English).

### Medium
7. Coverage: include `src/tts/language/**` and raise toward 80%.
8. Desktop `dist:mac` runtime listen test; `dist:win` structure verify + WINDOWS_TESTING.md.
9. Clear unused-import lint warnings if touching those files.

### Nice-to-have
10. Extra pt-BR Piper voices (jeff/cadu female/male variety).
11. Full M4B polish; Kokoro optional for EN only.

---

## 7. Dependency of pt-BR Expansion on G25 Features

| pt-BR need | G25 dependency | Status |
|------------|----------------|--------|
| Download voice models | Model manager + download-piper | Code ✅ / assets 🔴 |
| Synthesize offline | Piper engine resolve + binary | Code ✅ / binary 🔴 |
| Sentence chunking | Text chunker + language config | ✅ |
| Numbers/currency | pt-br.formatter | ✅ |
| Pronunciation | Dictionary language filter | ✅ |
| Dialogue | Em-dash parser | ✅ |
| Mixed docs | mixed-language-synthesizer + detector | ✅ code |
| Demo verification | demo scripts + samples | ⚠️ scripts ok, runtime blocked |
| Desktop OOTB | electron-builder + afterPack + bundled models | ⚠️ scripts ok, needs assets |
| UI language picker | ui/voice + deliverable | ⚠️ partial |

**Bottom line:** The longform branch already contains **most multilingual code**. The G28 job is primarily: **(1) make Piper runtime real**, **(2) fix language-aware engine selection**, **(3) verify demos by listening**, **(4) package desktop with both languages**, **(5) ship e2e + deliverable + PR**.

---

## 8. Host Environment Notes

- **macOS say pt-BR voices installed:** Luciana, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley.
- **pt_PT present:** Joana (must not be offered as pt-BR).
- **Piper system binary:** not on PATH.
- **Related remote branch:** `origin/feat/tts-multilingual-completion` is 3 commits ahead with engine-selection fix, e2e suite, deliverable showcase, desktop verification docs — cherry-pick candidates.

---

*End of Phase 0 forensic audit. No implementation changes in this commit.*
