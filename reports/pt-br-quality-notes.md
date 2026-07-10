# pt-BR quality notes

Date: 2026-07-10 · Voice: Piper `pt_BR-faber-medium` · Engine auto → piper (Kokoro skipped)

| Demo | Duration | RTF | Quality (1–10) | Notes |
|------|----------|-----|----------------|-------|
| frase-rapida | ~4.8s | ~0.77× | 7 | Natural Brazilian cadence; nasal vowels OK |
| paragrafo | ~17s | ~2.1× | 7 | Flow good; medium model slightly robotic on long clauses |
| numeros-e-datas | ~51s | ~4.1× | 7 | Formatter expands R$/dates before synth; listen for reais not dollars |

Critical fix verified: without language-aware engine selection, auto mode crashed via Kokoro on pt-BR.
