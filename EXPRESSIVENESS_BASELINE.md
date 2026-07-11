# Expressiveness Baseline — v2.0.0 ceiling (Phase 2)

**Date:** 2026-07-12  
**Machine:** Apple M4 Max, arm64  
**Engines measured:** Piper (`en_US-lessac-medium`, `pt_BR-faber-medium`), Kokoro (`af_sarah`), platform (`say`) for reference.

This is the **before** evidence. Every later gate compares against these numbers and the listening notes.

---

## Metric definitions

Computed by `scripts/prosody-metrics.js` → librosa in `tools/prosody-venv`:

| Metric | Definition |
|--------|------------|
| **F0 mean (Hz)** | Mean of voiced frames via `librosa.pyin` (65–400 Hz) |
| **F0 range (Hz)** | max(F0) − min(F0) on voiced frames |
| **F0 variance** | Variance of voiced F0 (Hz²) |
| **Prosodic diversity** | Variance of per-segment F0 means (anti-metronome). Higher = more sentence-to-sentence pitch variety |
| **Energy mean** | Mean RMS |
| **Speech-rate proxy** | Voiced-frame density × frame rate |

**Self-test:** synthetic pure tones at 120 / 220 / 330 Hz must recover mean F0 within **±5%**. Result: **PASS** (deltas 0.03%, 0.03%, 0.01%).

---

## Flat-affect proof (death-scene vs picnic)

Same sentence structures, opposite affect. Piper metrics:

| Fixture | F0 mean | F0 range | F0 variance | Prosodic diversity | Duration |
|---------|---------|----------|-------------|--------------------|----------|
| death-scene (grief) | 190.84 | 255.35 | **2318.85** | 924.99 | 24.17 s |
| picnic (joy) | 195.70 | 251.63 | **2300.72** | 1069.16 | 25.11 s |
| **ratio death/picnic** | 0.975 | 1.015 | **1.008** | 0.865 | — |

**Finding:** F0 variance ratio ≈ **1.00**. Mean pitch differs by ~5 Hz. A death scene and a picnic are statistically the same performance — the flat-affect TTS signature.

### Listening notes (Piper, death vs picnic)

- Same speaking rate and “newscaster” neutrality on both.
- No audible grief vs brightness; pauses follow punctuation only.
- Whisper/shout verbs in dialogue fixture are spoken at full volume with identical energy.
- **This is the gap Phase 4–10 close.**

Kokoro death vs picnic:

| Fixture | F0 mean | F0 variance | Prosodic diversity |
|---------|---------|-------------|--------------------|
| death-scene | 203.41 | 1808.97 | 1122.17 |
| picnic | 204.47 | 2018.81 | 1271.05 |
| ratio | ~1.00 | **0.90** | 0.88 |

Slightly more diversity on picnic, still not directed affect. Kokoro is the speed/quality floor, not an expressive director.

---

## Full Piper metric table (selected fixtures)

| Fixture | F0 mean | F0 range | F0 var | Prosodic diversity | Energy | Dur (s) |
|---------|---------|----------|--------|--------------------|--------|---------|
| death-scene | 190.84 | 255.35 | 2318.85 | 924.99 | 0.135 | 24.17 |
| picnic | 195.70 | 251.63 | 2300.72 | 1069.16 | 0.124 | 25.11 |
| newscast | 194.73 | 280.15 | 2562.34 | 1495.99 | 0.119 | 22.11 |
| dialogue-performance | 194.50 | 272.63 | 2656.36 | 1728.69 | 0.128 | 24.67 |
| suspense | 195.27 | 274.18 | 3132.78 | 1144.54 | 0.136 | 18.33 |

Note: **newscast** already has relatively high F0 variance from sentence length diversity — later gates require expressiveness to rise on **drama**, not maximal variance on news.

---

## Render RTF (this machine)

| Engine | Fixture set | Typical RTF |
|--------|-------------|-------------|
| Piper | full 9 fixtures | ~0.04–0.11 |
| Kokoro | full 9 fixtures | ~0.17–0.19 |
| Platform say | full 9 fixtures | ~0.12–0.15 |

Artifacts: `bench/baseline/{piper,kokoro,platform}/*.wav`  
Metrics JSON: `bench/metrics/baseline-piper.json`, `baseline-kokoro.json`

---

## Fixture inventory

| Path | Purpose |
|------|---------|
| `samples/expressive/death-scene.txt` | Grief / slow (paired) |
| `samples/expressive/picnic.txt` | Joy / bright (paired) |
| `samples/expressive/suspense.txt` | Building tension |
| `samples/expressive/comedy-beat.txt` | Timing / deadpan |
| `samples/expressive/newscast.txt` | Neutral control |
| `samples/expressive/children-story.txt` | Animated |
| `samples/expressive/dialogue-performance.txt` | Attribution verbs |
| `samples/expressive/pt-br/cena-dramatica.txt` | pt-BR drama |
| `samples/expressive/pt-br/dialogo-expressivo.txt` | pt-BR dialogue + travessão verbs |

---

## Gates derived from this baseline

1. **Directed drama** must show higher F0 variance/range on death-scene (and lower or distinct contour on picnic) than Piper baseline — not a global variance max.
2. **Newscast** must stay relatively flat (no over-acting).
3. Pause conformance and WER must not regress vs v2.0.0.
4. Blind CMOS ≥ +0.5 for directed expressive stack vs this Piper default (Gate 2).
