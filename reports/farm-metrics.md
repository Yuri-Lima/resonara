# Farm metrics — catalog

Generated: 2026-07-12T17:12:34.522Z

## Methodology (measured vs proxy)

| Signal | Method |
|---|---|
| WER | faster-whisper-asr (measured rows: 24, proxy rows: 0) |
| Pause conformance | pause-probe-profile-band (real: 24, proxy: 0) |
| Whisper available | true · enabled=true · model=tiny |

> All WER rows are ASR-measured (werIsProxy=false).

## Aggregates

| Metric | Value |
|---|---|
| total | 24 |
| measured | 24 |
| failed | 0 |
| mean WER (gate key) | 0.2521 |
| mean WER measured (ASR) | 0.2521 |
| mean WER proxy | n/a |
| mean pause conformance | 34.0% |
| mean RTF | 0.346 |
| invalid audio | 0 |

## Per row

| id | engine | profile | lang | WER | wer kind | conf | pause kind | RTF | valid |
|---|---|---|---|---|---|---|---|---|---|
| en-quick-sentence__piper__audiobook | piper | audiobook | en | 0.000 | measured | 0% | profile-band | 0.40 | true |
| en-ssml-showcase__piper__audiobook | piper | audiobook | en | 0.152 | measured | 29% | profile-band | 0.45 | true |
| pt-ssml__piper__audiobook | piper | audiobook | pt-BR | 0.263 | measured | 44% | profile-band | 0.44 | true |
| pt-paragrafo__piper__audiobook | piper | audiobook | pt-BR | 0.167 | measured | 20% | profile-band | 0.42 | true |
| pt-dialogo__piper__audiobook | piper | audiobook | pt-BR | 0.236 | measured | 42% | profile-band | 0.42 | true |
| en-dialogue-script__piper__audiobook | piper | audiobook | en | 0.118 | measured | 47% | profile-band | 0.46 | true |
| en-paragraph__piper__audiobook | piper | audiobook | en | 0.068 | measured | 10% | profile-band | 0.40 | true |
| en-children-story__piper__audiobook | piper | audiobook | en | 0.014 | measured | 40% | profile-band | 0.32 | true |
| en-numbers-and-dates__piper__audiobook | piper | audiobook | en | 0.361 | measured | 14% | profile-band | 0.35 | true |
| en-pronunciation-challenge__piper__audiobook | piper | audiobook | en | 0.322 | measured | 19% | profile-band | 0.38 | true |
| pt-artigo__piper__audiobook | piper | audiobook | pt-BR | 0.188 | measured | 35% | profile-band | 0.35 | true |
| pt-pronuncia__piper__audiobook | piper | audiobook | pt-BR | 0.663 | measured | 14% | profile-band | 0.55 | true |
| pt-tecnico__piper__audiobook | piper | audiobook | pt-BR | 0.580 | measured | 32% | profile-band | 0.28 | true |
| pt-numeros__piper__audiobook | piper | audiobook | pt-BR | 0.771 | measured | 28% | profile-band | 0.36 | true |
| pt-noticia__piper__audiobook | piper | audiobook | pt-BR | 0.618 | measured | 32% | profile-band | 0.33 | true |
| pt-historia__piper__audiobook | piper | audiobook | pt-BR | 0.264 | measured | 6% | profile-band | 0.07 | true |
| en-short-article__piper__audiobook | piper | audiobook | en | 0.056 | measured | 36% | profile-band | 0.29 | true |
| pt-ensaio__piper__audiobook | piper | audiobook | pt-BR | 0.253 | measured | 52% | profile-band | 0.29 | true |
| en-long-essay__piper__audiobook | piper | audiobook | en | 0.060 | measured | 38% | profile-band | 0.36 | true |
| en-news-expanded__piper__audiobook | piper | audiobook | en | 0.032 | measured | 36% | profile-band | 0.28 | true |
| pt-capitulo__piper__audiobook | piper | audiobook | pt-BR | 0.160 | measured | 56% | profile-band | 0.11 | true |
| en-news__piper__audiobook | piper | audiobook | en | 0.152 | measured | 66% | profile-band | 0.24 | true |
| en-technical-doc__piper__audiobook | piper | audiobook | en | 0.454 | measured | 63% | profile-band | 0.36 | true |
| en-book-chapter__piper__audiobook | piper | audiobook | en | 0.098 | measured | 56% | profile-band | 0.40 | true |

## Recommended defaults (data-derived)

| contentType | engine | profile | score |
|---|---|---|---|
| quick-sentence | piper | audiobook | 0.607 |
| ssml-showcase | piper | audiobook | 0.628 |
| paragraph | piper | audiobook | 0.608 |
| dialogue-script | piper | audiobook | 0.710 |
| children-story | piper | audiobook | 0.745 |
| numbers-and-dates | piper | audiobook | 0.481 |
| pronunciation-challenge | piper | audiobook | 0.513 |
| short-article | piper | audiobook | 0.715 |
| technical-doc | piper | audiobook | 0.603 |
| news | piper | audiobook | 0.776 |
| long-form-essay | piper | audiobook | 0.714 |
| book-chapter | piper | audiobook | 0.755 |
