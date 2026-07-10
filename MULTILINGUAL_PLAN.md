# Multilingual Expansion Plan (pt-BR)

**Product:** Resonara — offline desktop audio studio  
**Languages:** English (existing) + Brazilian Portuguese (pt-BR, new)  
**Depends on:** [G25_AUDIT_REPORT.md](./G25_AUDIT_REPORT.md)  
**Date:** 2026-07-10  
**Constraint:** Offline-first. No cloud TTS or translation APIs. **pt-BR ≠ pt-PT.**

---

## 1. G25 Audit Summary

Branch `feat/tts-neural-longform` has a **working English long-form Piper pipeline** (chunk → synthesize → trim → crossfade → post-process → persist jobs) with demos and UI. Critical gaps:

- **3 unit tests fail** (chapter detection fixture vs conservative logic; crossfade tests with sub-44-byte stubs).
- **Coverage** 75.8% stmts / 78.2% lines — below 80% threshold.
- **Native Piper binary broken** on this arm64 Mac (x86_64 + missing dylib); **Python venv piper works**.
- **No pt-BR models**, language layer, detection, formatters, or multilingual UI.
- **Electron packaging** would ship a non-runnable Piper path.

**G25 completion strategy (order):**

1. **Phase 2** — Fix tests + ensure Piper resolution (venv) green for demos.  
2. **Phase 3** — Re-run/fix `demo:all` reliability.  
3. **Phase 4** — Triage G25 gaps needed by pt-BR: model manager language filter, pronunciation language scope, job persistence smoke, markdown import (already mostly done).  
4. **Phases 6–23** — Multilingual expansion.  
5. **Phases 24–26** — Package DMG (runtime-verify) + NSIS (build-verify).  

Do **not** rebuild G25 features that already work (SSML, batch, timestamps, M4B polish).

---

## 2. Piper pt-BR Model Inventory

Source: [huggingface.co/rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) `voices.json` + tree `pt/pt_BR/`.

| Key | Quality | Sample rate | Speakers | Size (onnx) | Gender* | Download base |
|-----|---------|-------------|----------|-------------|---------|---------------|
| `pt_BR-faber-medium` | medium | 22050 | 1 | 63,201,294 | male (assumed) | `…/pt/pt_BR/faber/medium/` |
| `pt_BR-jeff-medium` | medium | 22050 | 1 | 62,950,044 | male (assumed) | `…/pt/pt_BR/jeff/medium/` |
| `pt_BR-cadu-medium` | medium | 22050 | 1 | 62,950,044 | male (assumed) | `…/pt/pt_BR/cadu/medium/` |
| `pt_BR-edresson-low` | low | 16000 | 1 | 63,104,526 | male (assumed) | `…/pt/pt_BR/edresson/low/` |

\*Model cards do not state gender; names are masculine. **No multi-speaker pt_BR models** in registry. **No official female neural pt_BR Piper voice** found — female coverage via **platform Luciana (macOS)** / **SAPI Maria (Windows language pack)**.

**pt_PT (do not use as pt-BR):** `pt_PT-tugão-medium` only.

**Default bundle decision:**

| Role | Model | Rationale |
|------|-------|-----------|
| Default EN | `en_US-lessac-medium` (already installed) | Quality baseline, female |
| Default pt-BR | `pt_BR-faber-medium` | Medium quality, finetuned from lessac |
| Secondary pt-BR | `pt_BR-jeff-medium` | Second male for dialogue contrast |
| Skip for default bundle | cadu, edresson-low | Size budget; downloadable via model manager |

**URLs (pattern):**
```
https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/{name}/{quality}/pt_BR-{name}-{quality}.onnx?download=true
https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/{name}/{quality}/pt_BR-{name}-{quality}.onnx.json?download=true
```

**Quality vs English:** Faber/jeff medium are finetuned from lessac medium — expect similar RTF and slightly different prosody. Edresson low is 16 kHz — avoid as default.

**Local test plan:** Download faber-medium; synthesize `Olá, como você está?` with venv piper; listen for nasal ão/ã and natural BR cadence (not pt-PT).

---

## 3. Portuguese Text Processing Rules

### 3.1 Sentence boundaries
- Protect abbreviations: `Sr.`, `Sra.`, `Dr.`, `Dra.`, `Prof.`, `Profa.`, `Av.`, `R.`, `n.°`/`nº`, `Ltda.`, `S.A.`, `etc.`, `p.ex.`
- Em-dash dialogue: `— Você vem? — perguntou ela.` — treat line-leading `—` as dialogue start; mid-line `—` + attribution verb as speaker tag, not hard sentence end.
- Ellipsis `...` / `…` is pause, not always sentence end.
- Quotation: `«»` and `"` both valid; do not split inside quotes.

### 3.2 Numbers (Brazilian)
- Thousands: `.` · Decimals: `,` · Example: `1.234,56`
- **Must not** split sentences on thousands separators.

### 3.3 Currency
- `R$ 1,00` → "um real"  
- `R$ 2,50` → "dois reais e cinquenta centavos"  
- `R$ 1.000.000,00` → "um milhão de reais"  
- `R$ 4,2 milhões` → "quatro vírgula dois milhões de reais"

### 3.4 Dates / time
- `DD/MM/YYYY` (never MM/DD for pt-BR)  
- `25/12/2025` → "vinte e cinco de dezembro de dois mil e vinte e cinco"  
- `14h30` → "quatorze horas e trinta minutos" (optional expansion)

### 3.5 Phone / IDs
- `+55 (11) 98765-4321` → grouped digit speech  
- CPF `123.456.789-00` / CNPJ `12.345.678/0001-90` → digit-by-digit groups  
- CEP `01310-100` → digit groups

### 3.6 Ordinals
- `1°`/`1º` → primeiro · `1ª` → primeira · `3°` → terceiro

---

## 4. Pronunciation Dictionary Expansion (pt-BR)

All entries `language: 'pt-BR'`. **Never apply EN dict to pt-BR text.**

**Abbreviations:** Sr.→Senhor, Sra.→Senhora, Dr.→Doutor, Dra.→Doutora, Prof./Profa., Av., R., n.°→número, Ltda., S.A., CEP/CPF/CNPJ/IBGE/INSS/FGTS/SUS/OAB/CRM (letter-spelled where customary).

**Keep-as-word:** DETRAN, Petrobras, Embraer, Nubank.

**Tech loanwords (BR pronunciation aliases):** software, hardware, design, marketing, feedback, startup, app, link, site, blog, login, layout, mouse, download, upload, streaming, framework, deploy, sprint.

**Culture terms (alias or IPA when helpful):** açaí, guaraná, brigadeiro, caipirinha, pão de queijo, chimarrão.

**Do NOT override:** dialectal word-final S (Rio /ʃ/ vs SP /s/) — Piper model owns this. Nasal vowels ã/õ/ão handled by model — dictionary must not mangle them.

---

## 5. Language Detection Strategy

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **franc** (npm, MIT) | Offline, no native deps, 50+ langs | Needs ~10+ chars | **Primary** |
| cld3 | Very accurate | Native bindings, heavy | Reject for desktop simplicity |
| Char heuristic (ãçêóúõ) | Tiny, offline | en vs pt only | **Fallback** when franc confidence low |

**API design (`language-detector.ts`):**
- `detectLanguage(text) → { code, confidence }`
- `detectParagraphLanguages(text) → blocks[]`
- `detectSentenceLanguages` for fine-grained mixed paragraphs
- Threshold default **0.7**; short text **&lt; 20 chars** → user language or `en`
- Map franc `por` → `pt-BR` (product default for Portuguese; never silently use pt-PT voices)

**Auto-routing:** detected language → `getDefaultVoice(lang)` → Piper preferred, then platform same language.

---

## 6. Mixed-Language Synthesis Design

```
text → paragraph detect → group consecutive same-lang blocks
  → per block: format(locale) → applyDictionary(lang) → chunk(lang) → synth(voice[lang])
  → crossfade blocks (inter-language pause ~300ms)
```

**Voice pairing:** user map `{ en, pt-BR }` or auto best quality; prefer matching gender when possible (EN female lessac + platform Luciana for female BR; EN male ryan + faber for male BR).

**Challenge:** mid-doc voice identity change is inherent without bilingual models. Mitigate with gender pairing + slightly longer boundary pause.

**Never:** synthesize Portuguese with English voice as fallback (error instead).

---

## 7. i18n Architecture

```
src/tts/language/
  language.types.ts       # LanguageCode, LanguageConfig
  en.config.ts
  pt-br.config.ts
  language-registry.ts
  language-detector.ts
  en.formatter.ts
  pt-br.formatter.ts
  formatter.registry.ts
  mixed-language-synthesizer.ts
```

**Abstraction points:**
| Layer | Change |
|-------|--------|
| Text chunker | `language` option → abbreviations, number protection, em-dash |
| Pronunciation | filter by `language` |
| Formatters | pre-pass before dictionary |
| Voice manager | `listVoices({ language })`, `getDefaultVoice(lang)`, no cross-lang fallback |
| Model manager | registry entries with `language: pt-BR` |
| Samples / demos | `samples/texts/pt-br/`, `demo:pt:*` |
| UI | language picker + TTS labels only (not full app i18n) |

---

## 8. Sample Text Fixtures (pt-BR)

Under `samples/texts/pt-br/`:

| File | Purpose |
|------|---------|
| frase-rapida.txt | 1 sentence smoke |
| paragrafo.txt | Prosody / punctuation |
| artigo-curto.txt | Proper nouns, music history |
| noticia.txt | R$, dates, phone, CPF, startups |
| capitulo-livro.txt | Em-dash multi-character fiction |
| documento-tecnico.txt | PT prose + EN tech terms |
| dialogo-roteiro.txt | `[speaker]:` tags |
| desafio-pronuncia.txt | Hard BR place names / food |
| numeros-e-datas.txt | Formatter stress test |
| misturado-en-pt.txt | Mixed-language pipeline |
| ssml-demonstracao.txt | SSML + IPA (Phase 18) |

---

## 9. Demo Scripts

```json
"demo:pt:rapida": "… --lang pt-BR frase-rapida",
"demo:pt:paragrafo": "…",
"demo:pt:artigo": "…",
"demo:pt:noticia": "…",
"demo:pt:capitulo": "…",
"demo:pt:tecnico": "…",
"demo:pt:dialogo": "…",
"demo:pt:pronuncia": "…",
"demo:pt:numeros": "…",
"demo:pt:misturado": "…",
"demo:pt:ssml": "…",
"demo:pt:all": "… --lang pt-BR --all",
"demo:pt:compare": "… --lang pt-BR --compare paragrafo",
"demo:all-languages": "… --all-languages",
"benchmark:pt": "node scripts/benchmark.js --lang pt-BR"
```

Output: `demo-output/pt-br/<name>.wav`.

---

## 10. Platform-Native Portuguese Fallback

### macOS (verified on audit machine)
- **pt_BR:** Luciana, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley  
- **pt_PT:** Joana — map to `pt-PT`, **exclude from pt-BR lists**

### Windows
- Microsoft Maria / Daniel (pt-BR) only if language pack installed  
- Enumerate via `VoiceInfo.Culture`, never parse display strings  
- Zero pt-BR SAPI voices → report empty platform list; UI: "Piper required for Portuguese"

### Fallback chain
```
pt-BR: Piper pt-BR (quality desc) → platform pt-BR → ERROR
en:    Piper en → platform en → ERROR
```
**No cross-language fallback.**

---

## 11. Desktop Packaging Strategy

### Size budget
| Asset | ~Size |
|-------|-------|
| en_US-lessac-medium | 63 MB |
| pt_BR-faber-medium | 63 MB |
| Optional jeff | +63 MB |
| Piper binary + espeak data | ~20–25 MB |
| **Default (en + faber + binary)** | **~150 MB voices+engine** |

**Decision: bundle EN lessac + pt-BR faber** (~126 MB models). Acceptable for a desktop audio studio. Secondary models downloadable. Document in README.

### macOS DMG
- Target: current arch (arm64 primary)  
- `extraResources`: piper runtime + models  
- **afterPack:** `chmod +x`, ad-hoc `codesign --force -s -` on binaries  
- Prefer **working** runtime: either fixed native aarch64 + dylibs OR embed portable piper-tts strategy that actually runs  
- sql.js DB under `app.getPath('userData')` (already in main.js)  
- **Verify:** install DMG → launch .app → synth EN + pt-BR offline → listen

### Windows NSIS (cross-build from macOS)
- Asset: `piper_windows_amd64.zip` (verified name on release `2023.11.14-2`, ~22 MB)  
- Shared `.onnx` models (not duplicated per OS in source tree)  
- Build-verify artifact structure; **runtime = WINDOWS_TESTING.md checklist**  
- Label honestly: **build-verified**, not runtime-tested (unless Windows host available)

### Known G25 failure mode
Official `piper_macos_aarch64.tar.gz` previously yielded unusable binary. Packaging phase **must** prove `piper --help` and one-sentence synth on the packaged app.

---

## 12. Risk Assessment by Phase

| Phase | Risk | Mitigation |
|-------|------|------------|
| 2–3 Stabilize | Low | Fix tests; re-run demos |
| 4 G25 triage | Low | Prefer model manager + lang filters |
| 6 Language layer | Medium | Regress English chunking — keep EN tests green |
| 7 pt-BR models | Medium | Large downloads; verify faber synth |
| 8–9 Samples + detection | Low | franc edge cases on short text |
| 11–13 Dict/format/chunker | Medium | Cross-contamination EN↔PT dict |
| 14 Mixed-lang | High | Voice switch jarring; tune pause/crossfade |
| 17 Em-dash dialogue | Medium | Attribution verb heuristics imperfect |
| 19 Platform voices | Low | Luciana present here; Windows may lack pack |
| 24 Packaged Piper | **High** | Broken native binary history; mandate runtime listen |
| 25 Win cross-build | Medium | NSIS works from macOS usually; no runtime |

---

## 13. Implementation Order (execution map)

| Phase | Deliverable |
|-------|-------------|
| 1 | This plan + audit (done when committed) |
| 2–3 | Green build/test/demos |
| 4 | Model manager + gaps for pt-BR |
| 5 | English listening baseline |
| 6 | Language abstraction |
| 7 | pt-BR models integrated |
| 8 | pt-BR samples + demo scripts |
| 9 | Language detector |
| 10 | Listen pt-BR basics |
| 11–13 | Dict, formatters, chunker rules |
| 14–15 | Mixed-lang + full listen |
| 16–18 | UI, dialogue, SSML pt-BR |
| 19–21 | Platform fallback, benchmarks, tests |
| 22–23 | Full listen + e2e |
| 24–26 | DMG + NSIS + desktop verification |
| 27–29 | Deliverable, docs, final PR |

---

## 14. Non-Goals

- Full UI localization (only TTS-related labels)  
- European Portuguese as default  
- Cloud TTS / cloud language ID  
- Changing Audio Lab or Piano unless shared code  
- Claiming Windows runtime verification without a Windows machine  

---

*Commit this file before any implementation code. Review loop after Phase 1: build + test only.*
