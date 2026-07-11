# Phase 14 — A/B vs v1.0.0

## Archives
- Before: `reports/ab-baseline/piper_*.wav`, `platform_*.wav`, `v1.0.0/`
- After: `reports/probe-out/{piper,platform}/{profile}/{fixture}/out.wav`

## Paragraph gap (piper en-punctuation)
| | para avg |
|---|---:|
| v1.0.0 baseline | **65 ms** |
| new audiobook | **850 ms** |

## Sentence gap
| | sent avg |
|---|---:|
| baseline | **137 ms** |
| new | **450 ms** |

UI embeds A/B paths under Prosody section when API serves `/reports/`.
