# G25 Forensic Audit Report

**Branch audited:** `feat/tts-neural-longform` (preferred over `feat/tts-neural-overhaul` — 3 commits ahead of main with the most recent Piper long-form work; overhaul has 10 older commits)  
**Audit date:** 2026-07-10  
**Auditor:** G26 session (Phase 0/1)  
**Machine:** macOS arm64  
**Constraint:** Offline-first Resonara TTS — no cloud APIs

This report is the **source of truth** for what G25 actually shipped. Do not trust prior session claims without cross-checking here.

---

## 1. Build / Test / Lint / Coverage Baseline

### 1.1 `npm install`

| Metric | Result |
|--------|--------|
| Status | ✅ Success (`up to date, audited 1067 packages in 2s`) |
| Peer dependency failures | None reported |
| Funding notices | 187 packages |
| Vulnerabilities | 31 (3 low, 21 moderate, 7 high) — pre-existing; not fixed in audit |
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
| Test suites | 2 failed, 25 passed, **27 total** |
| Tests | **3 failed**, 113 passed, **116 total** |
| Time | ~6.4s |

#### Failing tests (exact messages)

1. **`tts/text-chunker.spec.ts` — `detectChapters › finds markdown headings`**
   - Expected: `ch.length >= 2`
   - Received: `1`
   - Cause: `detectChapters()` was deliberately made conservative (H1 / "Chapter N" only; `##` headings only when avg body ≥ 40 words). Fixture `# Intro\n\nHello\n\n## Chapter Two\n\nWorld` has tiny bodies → collapses to single `Body` chapter. **Test outdated vs intentional product fix.**

2. **`ffmpeg/tts-audio.spec.ts` — `crossfadeChunks copies single part`**
   - `BadRequestException: No valid audio parts to crossfade`
   - Cause: `crossfadeChunks` requires `stat.size > 44` (real WAV header size). Test writes `fs.writeFileSync(a, 'data')` (4 bytes) → filtered out.

3. **`ffmpeg/tts-audio.spec.ts` — `crossfadeChunks uses acrossfade for two parts`**
   - Same root cause: stub files `'a'` / `'b'` are below 44-byte threshold.

### 1.4 `npx eslint src/ --ext .ts`

| Metric | Result |
|--------|--------|
| Errors | **0** |
| Warnings | **8** (all `@typescript-eslint/no-unused-vars`) |
| Files | `ffmpeg.service.ts` (2), `create-take.dto.ts` (1), `queue.module.ts` (1), `tracks.controller.ts` (2), `tracks.service.ts` (2) |

### 1.5 `npm run test:cov`

| Metric | % |
|--------|---|
| Statements | **75.76%** (threshold 80% — **FAIL**) |
| Branches | **57.51%** |
| Functions | **71.79%** |
| Lines | **78.24%** (threshold 80% — **FAIL**) |

Coverage collection is **narrow** (only selected TTS/gateway/jobs files in `package.json` `collectCoverageFrom`). Threshold failure is real against configured scope.

---

## 2. Feature Inventory

Status legend: ✅ WORKING · ⚠️ PARTIAL · ❌ MISSING · 🔴 BROKEN

| Feature | Status | Evidence |
|---------|--------|----------|
| **IMPROVEMENT_PLAN.md** | ✅ WORKING | Comprehensive plan at repo root (~15KB). Architecture analysis, Piper strategy, phases. Slightly stale vs current LOC (e.g. still mentions in-memory jobs as weakness W4 while code now uses TypeORM). |
| **Sample texts (10)** | ✅ WORKING | All 10 present under `samples/texts/`: quick-sentence, paragraph, short-article, news-article, book-chapter, technical-doc, ssml-showcase, dialogue-script, pronunciation-challenge, numbers-and-dates (+ extras mini-book.md, sample.md, comparison-notes.md). |
| **Demo scripts** | ⚠️ PARTIAL | Scripts exist (`demo:quick` … `demo:all`, `demo:compare`). Prior `demo-output/report.json` shows all 10 demos completed 2026-07-09 with valid WAV sizes. **Not re-run in this audit phase** (build/test only per Phase 0c). Infrastructure looks sound. |
| **Piper TTS engine** | ⚠️ PARTIAL | `src/tts/piper-tts.ts` is real (resolve, list voices, synthesize). **Native binary broken:** `resources/piper/piper` is **x86_64** Mach-O, fails with missing `@rpath/libespeak-ng.1.dylib`. **Python venv fallback WORKS:** `tools/piper-venv/bin/piper` resolves first, synthesizes valid 22.05kHz WAV. `isPiperAvailable()` → available, 1 voice. |
| **Voice Manager** | ⚠️ PARTIAL | Lists Piper + platform voices; language filter exists. Default voice prefers English (`/en/i`). No language-aware fallback chain for pt-BR. No pt-BR models installed. |
| **TTS Job Persistence** | ✅ WORKING (code) | `tts-job.entity.ts` + TypeORM `jobsRepo`. `onModuleInit` marks in-flight jobs FAILED on restart. Dual-mode (sql.js lite / Postgres). Runtime kill/restart not re-verified in audit. |
| **SSML Parser** | ✅ WORKING | `ssml-parser.ts` + specs; engine transforms present. English-centric. |
| **Pronunciation Dictionary** | ⚠️ PARTIAL | Entity + service + CRUD paths + seed (13 English entries). `applyDictionary()` works. **No language filter at apply time for mixed docs; no pt-BR seeds.** |
| **Dialogue Parser** | ⚠️ PARTIAL | `dialogue-parser.ts` parses `[speaker]:` tags. **No Portuguese em-dash (—) convention.** |
| **Text Chunker** | ⚠️ PARTIAL | Engine-aware sizes (Piper 4000/6000). English abbreviation handling only. No pt-BR number/em-dash rules. |
| **Silence Trimming** | ✅ WORKING | `ffmpeg.service.ts` `trimChunkSilence()` + unit test (invokes silenceremove). |
| **Crossfade** | 🔴 BROKEN (tests) / ✅ WORKING (impl) | Implementation present with empty-part guards + hard concat fallback. Unit tests fail due to undersized fixtures (see bugs). |
| **Streaming Preview** | ✅ WORKING (code) | `jobs.gateway.ts` emits `tts:chunk:ready`. |
| **Timestamp Aligner** | ✅ WORKING (code) | `timestamp-aligner.ts` + specs for WebVTT/SRT. |
| **Batch Synthesis** | ✅ WORKING (code) | `tts-batch.entity.ts` + service batch APIs. |
| **Model Manager** | ⚠️ PARTIAL | list/download registry works for **English only** (lessac, amy, ryan, alba). No pt-BR registry entries. File + DEFAULT_REGISTRY in code. |
| **Post-processing Pipeline** | ✅ WORKING (code) | Presets `podcast` / `audiobook` / `raw` / `custom` in `tts.service.ts` + ffmpeg postProcess. |
| **Document Import** | ⚠️ PARTIAL | `document-extractor.ts`: Markdown, HTML, DOCX (mammoth), PDF (pdf-parse), plain. EPUB path present but lighter. Specs cover MD/HTML/plain. |
| **Chapter Markers + M4B** | ⚠️ PARTIAL | Chapter-aware synthesis + M4B metadata path in ffmpeg/tts.service. Chapter detection conservative (intentional). Tests lag implementation. |
| **Re-synthesis** | ✅ WORKING (code) | `POST jobs/:id/chunks/:index/resynthesize` implemented. |
| **E2E Tests** | ❌ MISSING | `test/` has `ffmpeg.integration.spec.ts` + `jest-e2e.json` only — **no `test/e2e/` suite** with TTS HTTP flows. |
| **TypeScript Strict** | ✅ WORKING | `noImplicitAny: true`, `strictNullChecks: true` in tsconfig.json. |
| **UI Overhaul** | ⚠️ PARTIAL | `ui/voice/` has voice selector, SSML toggle, document upload zone, dict table, ARIA labels. No language selector / pt-BR panel / live detection. |
| **Accessibility** | ⚠️ PARTIAL | Substantial ARIA on voice + deliverable UI; not a full WCAG audit. Keyboard roles on upload zone, mode toggle, live status. |
| **Electron Packaging** | 🔴 BROKEN (packaged Piper) | `package.json` extraResources includes `resources/piper`. **Bundled binary is wrong arch / missing dylibs.** Desktop `main.js` sets `PIPER_PATH` to native path first — **does not prefer Python venv**. afterPack chmod/codesign **not configured**. Windows NSIS target declared; not verified. |
| **Performance Benchmarks** | ⚠️ PARTIAL | `scripts/benchmark.js` exists; npm script `benchmark`. English-only; not re-run. |
| **UI Deliverable** | ⚠️ PARTIAL | `ui/deliverable/` exists with TTS showcase sections (English-centric). `make ui` + `scripts/open-ui.sh` present. No multilingual sections. |

---

## 3. Bugs Found (with file:line and reproduction)

| # | Severity | Bug | Location | Reproduction |
|---|----------|-----|----------|--------------|
| B1 | **Critical** | Native Piper binary is x86_64 and missing espeak dylib | `resources/piper/piper` | `file resources/piper/piper` → x86_64; `./resources/piper/piper --version` → dyld `libespeak-ng.1.dylib` not loaded |
| B2 | **Critical (packaging)** | Desktop always points `PIPER_PATH` at native binary, not runnable venv | `desktop/main.js:49-63` | Package/run desktop: may set broken PIPER_PATH; venv not under extraResources |
| B3 | **High** | 3 unit tests fail | `text-chunker.spec.ts:64-66`, `tts-audio.spec.ts:63-84` | `npm test` |
| B4 | **High** | Coverage below threshold | `package.json` jest coverageThreshold | `npm run test:cov` fails global 80% lines/statements |
| B5 | **Medium** | `crossfadeChunks` rejects files ≤ 44 bytes | `ffmpeg.service.ts:1125` | Write tiny stub WAV → "No valid audio parts" (tests break; real empty clips also skipped — OK for prod, bad for tests) |
| B6 | **Medium** | Official macOS aarch64 tarball historically broken / wrong arch landed in resources | `scripts/download-piper.js` + resources | Prior download left x86_64 binary on arm64 machine |
| B7 | **Low** | 8 eslint unused-var warnings | see §1.4 | `npx eslint src/ --ext .ts` |
| B8 | **Medium** | No formal E2E TTS suite | `test/` | `npm run test:e2e` has no multilingual/long-form coverage |
| B9 | **Low** | IMPROVEMENT_PLAN stale on W4/W8 | `IMPROVEMENT_PLAN.md` | Docs claim in-memory jobs / noImplicitAny false — both fixed in code |

---

## 4. Stubs / Incomplete Implementations

| Item | Notes |
|------|-------|
| pt-BR Piper models | **None** in registry or on disk |
| Language abstraction | **None** — English-centric pipeline |
| Language detection | **None** |
| Mixed-language synthesis | **None** |
| pt-BR formatters (R$, dates, CPF) | **None** |
| pt-BR pronunciation seeds | **None** |
| Em-dash dialogue (pt-BR) | **None** |
| Language-aware fallback chain | Default voice is English-biased |
| E2E suite under `test/e2e/` | Missing |
| electron-builder afterPack | No chmod/codesign for arm64 Gatekeeper |
| Packaged Python piper-tts | Dev-only under `tools/piper-venv` — not shippable as-is without bundling strategy |
| Multi-speaker pt-BR models | HF registry: all pt_BR voices are single-speaker |

---

## 5. Claimed Done by G25 vs Reality

G25 commits (`feat(tts): neural Piper…`, dialogue/model manager, demos, UI dashboard) imply phases 1–21 of the original Piper plan were largely implemented. **Verified truth:**

| Claim area | Reality |
|------------|---------|
| Piper integration | **Works via Python venv**, not via bundled native binary |
| Long-form pipeline (chunk → trim → crossfade → post) | **Implemented** |
| Job persistence | **Implemented** (not in-memory) |
| SSML / pronunciation / dialogue / batch / timestamps / model manager | **Implemented (English)** |
| Document import / chapters / M4B / resynth | **Implemented** |
| Demo suite | **Previously green** (report.json); needs re-verify after fixes |
| Unit tests all green | **FALSE** — 3 failures |
| Coverage ≥ 80% | **FALSE** |
| E2E complete | **FALSE** — no real e2e suite |
| Electron packaged Piper works OOTB | **FALSE** — broken binary + no afterPack |
| Multilingual / pt-BR | **Never started** (out of G25 scope) |

---

## 6. Recommended Fix Priority

### Critical (block pt-BR and packaging)
1. Stabilize tests (B3) so CI/review loops are trustworthy  
2. Fix Piper resolution for packaging: prefer runnable binary; ship working runtime on arm64 (venv or fixed binary + dylibs + codesign)  
3. Add pt-BR models to registry + download path (depends on model manager)

### High (pt-BR foundation)
4. Language abstraction layer (configs, registry)  
5. Language detection (paragraph-level)  
6. pt-BR formatters + pronunciation + chunker rules  
7. Language-aware voice default / no cross-language fallback  

### Medium
8. Raise coverage; add multilingual unit + e2e tests  
9. Demo suite reliability re-run (`demo:all`)  
10. UI language selector + deliverable multilingual sections  

### Nice-to-have / later
11. M4B polish, EPUB depth  
12. eslint unused-vars cleanup  
13. npm audit vulnerabilities  

---

## 7. Dependency of pt-BR Expansion on G25 Features

| G25 feature | Required for pt-BR? | Why |
|-------------|---------------------|-----|
| Piper engine + model manager | **Yes** | Download/load pt_BR-*.onnx |
| Runnable Piper on target arch | **Yes** | Synthesis |
| Text chunker | **Yes** | Extend for abbreviations / R$ / em-dash |
| Pronunciation service | **Yes** | Language-scoped dictionary |
| FFmpeg trim/crossfade | **Yes** | Mixed-language block joins |
| Job persistence | **Yes** | Long-form pt-BR chapters |
| Dialogue parser | **Yes** | Em-dash convention |
| SSML parser | **Yes** | Accented chars + IPA |
| Voice manager | **Yes** | Language filter + fallback chain |
| Document import | **Yes** | pt-BR markdown fixtures |
| Demo runner | **Yes** | `demo:pt:*` verification backbone |
| Electron packaging | **Yes (phases 24–26)** | Bundle en + pt-BR models OOTB |
| Timestamp / batch / M4B | Optional | Not blockers for core multilingual |

---

## 8. Environment Notes (this machine)

| Item | Value |
|------|-------|
| Piper native | BROKEN x86_64, missing dylib |
| Piper Python venv | **OK** — synthesizes English lessac |
| Installed EN model | `en_US-lessac-medium` (~63MB) |
| macOS pt_BR voices | Luciana, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley |
| macOS pt_PT voice | Joana (must **not** be offered as pt-BR) |
| HF pt_BR models available | cadu-medium, edresson-low, faber-medium, jeff-medium (~63MB each, 1 speaker) |

---

## 9. G26 Resolution (filled as work completes)

| Gap | Status | Notes |
|-----|--------|-------|
| Test failures B3 | pending | Phase 2 |
| Piper packaging B1/B2 | pending | Phases 2, 24 |
| Coverage threshold | pending | Phase 21 |
| pt-BR expansion | pending | Phases 6–23 |
| Desktop DMG/NSIS | pending | Phases 24–26 |

---

*End of Phase 0 forensic audit. No product code was changed for this document.*
