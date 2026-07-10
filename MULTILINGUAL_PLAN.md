# Multilingual Expansion Plan (pt-BR)

**Product:** Resonara — offline desktop audio studio  
**Languages:** English (existing) + Brazilian Portuguese (pt-BR, new)  
**Depends on:** [G25_AUDIT_REPORT.md](./G25_AUDIT_REPORT.md)  
**Date:** 2026-07-10 (G28 refresh)  
**Constraint:** Offline-first. No cloud TTS or translation APIs. **pt-BR ≠ pt-PT.**

---

## 1. G25 Audit Summary (reference)

See **G25_AUDIT_REPORT.md** (G28 forensic baseline). Headline:

| Area | State |
|------|--------|
| Build / unit tests / lint errors | ✅ Green (187 tests, 0 fail, 0 lint errors) |
| Coverage | ⚠️ 75.7% stmts / 77.5% lines (below 80%) |
| Multilingual **code** (language layer, formatters, detector, dialogue em-dash, pt-BR seeds, demos) | ✅ Largely already on `feat/tts-neural-longform` |
| Piper **runtime** (binary + ONNX) | 🔴 Missing on clean checkout |
| Language-aware engine auto-select | 🔴 Kokoro preferred for pt-BR (English-only) |
| E2E multilingual suite | ❌ Missing on longform tip |
| Desktop OOTB both languages | ⚠️ Scripts exist; not verified |

**G28 completion strategy (order):**

1. **Phase 2** — `download:piper` (venv or native) + en/pt-BR ONNX; fix `resolveEngine(language)`; clean build/test.  
2. **Phase 3** — `demo:quick` + `demo:pt:rapida` + `demo:all` reliability (port hygiene).  
3. **Phase 4** — Cherry-pick multilingual-completion gaps (e2e, deliverable, engine wiring); expand thin pt-BR fixtures if needed.  
4. **Phases 5–23** — Listening verification + remaining multilingual polish (most code already present).  
5. **Phases 24–26** — Package DMG (runtime listen) + NSIS (build-verify + WINDOWS_TESTING.md).  
6. **Phases 27–29** — Deliverable dashboard, README, final PR.

Do **not** rewrite working G25 modules (SSML, batch, timestamps, chunker, formatters) unless listening proves defects.

---

## 2. Piper pt-BR Model Inventory

Source: [huggingface.co/rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) tree `pt/pt_BR/` (verified 2026-07-10 via HF API).

| Key | Quality | Sample rate | Speakers | Size (onnx) | Gender* | Download base |
|-----|---------|-------------|----------|-------------|---------|---------------|
| `pt_BR-faber-medium` | medium | 22050 | 1 | ~63.2 MB | male (assumed) | `…/pt/pt_BR/faber/medium/` |
| `pt_BR-jeff-medium` | medium | 22050 | 1 | ~63.0 MB | male (assumed) | `…/pt/pt_BR/jeff/medium/` |
| `pt_BR-cadu-medium` | medium | 22050 | 1 | ~63.0 MB | male (assumed) | `…/pt/pt_BR/cadu/medium/` |
| `pt_BR-edresson-low` | low | 16000 | 1 | ~63.1 MB | male (assumed) | `…/pt/pt_BR/edresson/low/` |

\*Cards do not state gender; speaker names are masculine. **No multi-speaker pt_BR models.** **No official female neural pt_BR Piper voice** — female coverage via **platform Luciana (macOS)** / **SAPI Maria (Windows language pack)**.

**pt_PT (do not use as pt-BR):** `pt_PT-tugão-medium` only.

**Default bundle decision:**

| Role | Model | Rationale |
|------|-------|-----------|
| Default EN | `en_US-lessac-medium` | Quality baseline, female, already in registry |
| Default pt-BR | `pt_BR-faber-medium` | Medium quality, primary offline BR voice |
| Optional 2nd pt-BR | `pt_BR-jeff-medium` | Dialogue contrast; downloadable via model manager |
| Skip default bundle | cadu, edresson-low | Size budget; edresson is 16 kHz |

**URLs:**
```
https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/{name}/{quality}/pt_BR-{name}-{quality}.onnx?download=true
https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/{name}/{quality}/pt_BR-{name}-{quality}.onnx.json?download=true
```

**Piper release assets (2023.11.14-2):**  
`piper_macos_aarch64.tar.gz`, `piper_macos_x64.tar.gz`, `piper_linux_*`, `piper_windows_amd64.zip` (piper.exe + onnxruntime DLLs + espeak-ng-data).  
On macOS arm64, official tarball is often broken → **Python `piper-tts` venv fallback** in `scripts/download-piper.js` is mandatory.

**Size budget:** en medium + pt-BR medium ≈ **120–150 MB** models. Acceptable for a desktop audio studio; ship both OOTB. Optional voices download on demand.

---

## 3. Portuguese Text Processing Rules

### 3.1 Sentence boundaries
- Protect abbreviations: `Sr.`, `Sra.`, `Dr.`, `Dra.`, `Prof.`, `Profa.`, `Av.`, `R.`, `n.°`/`nº`, `Ltda.`, `S.A.`, `etc.`, `p.ex.`
- Em-dash dialogue: `— Você vem? — perguntou ela.` — line-leading `—` = dialogue start; mid-line attribution ≠ hard sentence end.
- Ellipsis `...` / `…` = pause, not always sentence end.
- Quotation: `«»` and `"` both valid; do not split inside quotes.

### 3.2 Numbers (Brazilian)
- Thousands: `.` · Decimals: `,` · Example: `1.234,56` (opposite of EN).
- **Must not** split sentences on thousands separators.

### 3.3 Dates / phones / currency / IDs
- Dates: **DD/MM/YYYY** → spoken “vinte e cinco de dezembro de …”
- Phone: `+55 (11) 98765-4321` → grouped digits
- Currency: `R$` Real/Reais; singular `R$ 1,00` = “um real”
- Ordinals: `1°`/`1ª` → primeiro/primeira
- CPF `123.456.789-00` / CNPJ `12.345.678/0001-90` → digit groups

**Implementation:** `src/tts/language/pt-br.formatter.ts` + `expandTextForLanguage` before dictionary.

---

## 4. Pronunciation Dictionary Expansion (pt-BR)

| Category | Examples |
|----------|----------|
| Titles | Sr.→Senhor, Dra.→Doutora, Prof.→Professor |
| Gov IDs | CPF, CNPJ, CEP, IBGE, INSS, FGTS → letter spelling |
| Tech (keep EN-ish) | software→sóftuer, hardware→rárduer, framework→frêimuórque |
| Culture | açaí, guaraná, brigadeiro (prefer model; light IPA only if mangled) |

**Rules:** Do **not** override nasal vowels ã/õ/ão or dialectal final-S. Filter by `language='pt-BR'`. Never apply EN dictionary to PT text.

---

## 5. Language Detection Strategy

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **franc** | Compact, offline, MIT, 50+ langs | Weak on very short text | Optional later |
| **cld3** | Very accurate | Native deps, heavy | Reject for desktop |
| **Heuristic** | Zero deps, ã/ç/ê/ó/õ frequency | EN/pt only | **Primary (already implemented)** |

**Policy:**
- Paragraph-level detection for mixed docs (`detectParagraphLanguages`).
- Short text (<20 chars) or mostly symbols → user language or default `en`.
- Confidence &lt; 0.7 → fallback to explicit language / last selection.
- Auto-route: detected language → `getDefaultVoiceForLanguage` + language-safe engine.

---

## 6. Mixed-Language Synthesis Design

1. Detect per paragraph → group consecutive same-language blocks.  
2. Expand numbers/dates + pronunciation **per block language**.  
3. Synthesize each block with mapped voice (`voiceMap: { en, 'pt-BR' }`).  
4. Prefer same gender across languages when possible (EN female lessac ↔ platform Luciana for female pt-BR).  
5. Crossfade at language boundaries + ~300 ms inter-language pause.  
6. Skip micro-switches (&lt; ~5 words) — keep surrounding language voice.  
7. Job metadata: `languageBlocks[]` for UI review.

**Never** fall back across languages (pt-BR text → English voice is an error).

---

## 7. i18n Architecture

| Layer | Abstraction |
|-------|-------------|
| Config | `LanguageConfig` (abbreviations, number/date/currency, default voice) |
| Registry | `language-registry.ts` get/list/default |
| Formatters | `en.formatter` / `pt-br.formatter` via `formatter.registry` |
| Chunker | `chunkTextForTts(text, { engine, language })` |
| Dictionary | `applyDictionary(text, engine, language)` |
| Voices | `listVoices({ language })`, `getDefaultVoiceForLanguage` |
| UI | Language selector + TTS labels only (not full app i18n) |
| Samples / demos | `samples/texts/` vs `samples/texts/pt-br/` + `--lang` |

---

## 8. Sample Fixtures & Demo Scripts

**EN:** existing 10 files.  
**pt-BR:** frase-rapida, paragrafo, artigo-curto, noticia, capitulo-livro, documento-tecnico, dialogo-roteiro, desafio-pronuncia, numeros-e-datas, misturado-en-pt, ssml-demonstracao.

**Scripts:** `demo:pt:*`, `demo:pt:all`, `demo:pt:compare`, `demo:all-languages` (already in package.json).  
**Output:** `demo-output/pt-br/<name>.wav`.

**Gap:** expand short fixtures toward stress sizes when demos allow time.

---

## 9. Platform-Native Portuguese Fallback

| Platform | Voices | Notes |
|----------|--------|-------|
| macOS | Luciana (pt_BR) default; Eddy/Flo/… enhanced | Parse `say -v '?'` locale column; exclude Joana **pt_PT** |
| Windows | Microsoft Maria / Daniel (pt-BR) | Require language pack; if absent → zero platform pt-BR voices, clear UI message |
| Fallback chain | Piper pt-BR → platform pt-BR → **error** | Never English |

---

## 10. Desktop Packaging Strategy

| Target | Build host | Bundle | Verification |
|--------|------------|--------|--------------|
| macOS DMG (+ zip) | macOS only | Piper arm64 or venv path + en/pt-BR onnx | **Runtime:** install → launch → synth EN + pt-BR offline |
| Windows NSIS x64 | Cross from macOS OK | `piper.exe` + DLLs + shared models | **Build-verified** structure + `WINDOWS_TESTING.md` checklist |

**afterPack:** `chmod +x` piper; ad-hoc `codesign` arm64 binaries (Gatekeeper).  
**Size:** ~150 MB models acceptable.  
**Risk:** unsigned Windows SmartScreen; unsigned macOS quarantine — document Run anyway / right-click Open.

---

## 11. Risk Assessment by Phase

| Phase | Risk | Mitigation |
|-------|------|------------|
| 2 Piper install | Native aarch64 tarball broken | Python venv fallback; verify synthesize smoke |
| 2 Engine auto | Kokoro on pt-BR | Language-aware resolveEngine; tests |
| 3 Demos | Port collisions / loudnorm | Kill stale ports; hard-concat fallback for short clips |
| 7 Models | HF download flaky | Retry; cache; commit JSON only not onnx if LFS |
| 10–15 Listening | Model sounds pt-PT-ish | Stick to pt_BR-* keys; use Luciana as A/B |
| 14 Mixed | Jarring voice switch | Gender pairing + crossfade + min block length |
| 24–26 Package | Missing models in asar | extraResources; verify paths inside DMG/NSIS |
| Coverage | Threshold fail | Expand collectCoverageFrom + language specs |

---

## 12. Immediate Execution Checklist (G28)

- [x] G25_AUDIT_REPORT.md committed  
- [ ] MULTILINGUAL_PLAN.md committed (this file)  
- [ ] `npm run download:piper` complete (en + pt-BR onnx + binary/venv)  
- [ ] Language-aware engine selection fix  
- [ ] demo:quick + demo:pt:rapida green  
- [ ] Packaging + deliverable + PR  

*Plan committed before further implementation code in this session.*
