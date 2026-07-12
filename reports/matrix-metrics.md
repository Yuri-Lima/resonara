# Farm metrics — matrix

Generated: 2026-07-12T17:08:49.610Z

## Methodology (measured vs proxy)

| Signal | Method |
|---|---|
| WER | faster-whisper-asr (measured rows: 36, proxy rows: 0) |
| Pause conformance | pause-probe-profile-band (real: 36, proxy: 0) |
| Whisper available | true · enabled=true · model=tiny |

> All WER rows are ASR-measured (werIsProxy=false).

## Aggregates

| Metric | Value |
|---|---|
| total | 36 |
| measured | 36 |
| failed | 0 |
| mean WER (gate key) | 0.2526 |
| mean WER measured (ASR) | 0.2526 |
| mean WER proxy | n/a |
| mean pause conformance | 48.5% |
| mean RTF | 0.414 |
| invalid audio | 0 |

## Per row

| id | engine | profile | lang | WER | wer kind | conf | pause kind | RTF | valid |
|---|---|---|---|---|---|---|---|---|---|
| pt-dialogo__piper__audiobook | piper | audiobook | pt-BR | 0.264 | measured | 42% | profile-band | 0.83 | true |
| en-dialogue-script__platform__audiobook | platform | audiobook | en | 0.118 | measured | 53% | profile-band | 0.76 | true |
| pt-dialogo__piper__podcast | piper | podcast | pt-BR | 0.278 | measured | 47% | profile-band | 0.88 | true |
| en-dialogue-script__platform__podcast | platform | podcast | en | 0.118 | measured | 53% | profile-band | 0.76 | true |
| pt-dialogo__piper__news | piper | news | pt-BR | 0.264 | measured | 53% | profile-band | 0.81 | true |
| en-dialogue-script__platform__news | platform | news | en | 0.118 | measured | 47% | profile-band | 0.64 | true |
| en-dialogue-script__piper__news | piper | news | en | 0.132 | measured | 42% | profile-band | 0.72 | true |
| pt-dialogo__platform__audiobook | platform | audiobook | pt-BR | 0.653 | measured | 53% | profile-band | 0.57 | true |
| en-dialogue-script__piper__podcast | piper | podcast | en | 0.118 | measured | 47% | profile-band | 0.84 | true |
| pt-dialogo__platform__podcast | platform | podcast | pt-BR | 0.653 | measured | 47% | profile-band | 0.53 | true |
| en-dialogue-script__piper__audiobook | piper | audiobook | en | 0.171 | measured | 47% | profile-band | 0.72 | true |
| pt-dialogo__platform__news | platform | news | pt-BR | 0.653 | measured | 47% | profile-band | 0.49 | true |
| en-numbers-and-dates__piper__news | piper | news | en | 0.328 | measured | 14% | profile-band | 0.26 | true |
| en-numbers-and-dates__platform__news | platform | news | en | 0.164 | measured | 50% | profile-band | 0.26 | true |
| en-numbers-and-dates__piper__podcast | piper | podcast | en | 0.295 | measured | 7% | profile-band | 0.28 | true |
| en-numbers-and-dates__platform__podcast | platform | podcast | en | 0.197 | measured | 50% | profile-band | 0.08 | true |
| en-numbers-and-dates__piper__audiobook | piper | audiobook | en | 0.295 | measured | 14% | profile-band | 0.34 | true |
| en-numbers-and-dates__platform__audiobook | platform | audiobook | en | 0.164 | measured | 29% | profile-band | 0.10 | true |
| pt-artigo__piper__news | piper | news | pt-BR | 0.231 | measured | 30% | profile-band | 0.76 | true |
| pt-artigo__platform__news | platform | news | pt-BR | 0.632 | measured | 70% | profile-band | 0.12 | true |
| pt-artigo__piper__podcast | piper | podcast | pt-BR | 0.222 | measured | 30% | profile-band | 0.79 | true |
| pt-artigo__platform__podcast | platform | podcast | pt-BR | 0.923 | measured | 65% | profile-band | 0.16 | true |
| pt-artigo__piper__audiobook | piper | audiobook | pt-BR | 0.248 | measured | 45% | profile-band | 0.77 | true |
| pt-artigo__platform__audiobook | platform | audiobook | pt-BR | 0.590 | measured | 40% | profile-band | 0.13 | true |
| en-short-article__piper__news | piper | news | en | 0.056 | measured | 26% | profile-band | 0.30 | true |
| en-short-article__platform__news | platform | news | en | 0.069 | measured | 79% | profile-band | 0.07 | true |
| en-short-article__piper__podcast | piper | podcast | en | 0.077 | measured | 29% | profile-band | 0.28 | true |
| en-short-article__platform__podcast | platform | podcast | en | 0.067 | measured | 85% | profile-band | 0.08 | true |
| en-short-article__piper__audiobook | piper | audiobook | en | 0.048 | measured | 40% | profile-band | 0.28 | true |
| en-short-article__platform__audiobook | platform | audiobook | en | 0.064 | measured | 65% | profile-band | 0.08 | true |
| en-news__piper__news | piper | news | en | 0.140 | measured | 60% | profile-band | 0.34 | true |
| en-news__platform__news | platform | news | en | 0.143 | measured | 81% | profile-band | 0.07 | true |
| en-news__piper__podcast | piper | podcast | en | 0.156 | measured | 64% | profile-band | 0.33 | true |
| en-news__platform__podcast | platform | podcast | en | 0.149 | measured | 74% | profile-band | 0.07 | true |
| en-news__piper__audiobook | piper | audiobook | en | 0.154 | measured | 65% | profile-band | 0.33 | true |
| en-news__platform__audiobook | platform | audiobook | en | 0.142 | measured | 55% | profile-band | 0.07 | true |

## Recommended defaults (data-derived)

| contentType | engine | profile | score |
|---|---|---|---|
| dialogue-script | platform | podcast | 0.710 |
| numbers-and-dates | platform | podcast | 0.715 |
| short-article | platform | podcast | 0.902 |
| news | platform | news | 0.852 |
