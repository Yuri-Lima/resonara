# Evaluation Report — Expressive Tier Campaign

**Date:** 2026-07-12 (methodology correction same day)  
**Protocol:** **Human CMOS-blind-v1** (certifying) + objective prosody proxy (diagnostic only)  
**Machine:** Apple M4 Max, MPS

## Headline — Gate 2 status

| Gate | Comparison | Result | Certifying? |
|------|------------|--------|-------------|
| Gate 1 | Raw expressive vs Piper | see `bench/eval/gate1-unblind.json` (proxy history) | No — diagnostic |
| Gate 2 | Expressive product-path vs Piper | **`NOT_CERTIFIED_AWAITING_HUMAN_PANEL`** | **Yes — human only** |

**Honest status:** Gate 2 is **not certified**. No human blind panel ledger exists under `bench/eval/human-sessions/`. Automated scores must not be reported as CMOS PASS.

How to certify:

1. `npm run eval:gate2:manifest`
2. Serve app; open `/ui/eval-lab/`; load `session-manifest-gate2.json`
3. Score all trials (including identical anchor); download ledger
4. Save to `bench/eval/human-sessions/<id>.jsonl`
5. `npm run eval:gate2:status`

## Invalid prior claims (quarantined)

| Claim | Status | Why |
|-------|--------|-----|
| Offline Gate 2 CMOS **+1.0 PASS** (`directed-final`) | **INVALID — post-hoc DSP** | Offline ffmpeg AF applied to raw Chatterbox; not product capability; also scored by circular proxy |
| Product-path Gate 2 CMOS **+0.75 PASS** | **INVALID — circular proxy** | `affectFitness()` rewarded absolute F0 bands reverse-engineered from target audio (`mean < 165`, `mean > 208`) |

These numbers must not appear as shipping evidence. See `bench/eval/INVALID-QUARANTINE.md`.

## Methodology defect (fixed)

`scripts/blind-gate.js` previously used a hand-tuned `affectFitness()`:

```text
if (mean < 165) s += 1.0;   // "directed death ~161 Hz"
if (mean > 208) s += 1.0;   // "directed picnic ~206 Hz"
```

That is circular: the scorer rewards the F0 bands the candidate was built to land in. A self-graded proxy is **not** blind human CMOS.

**Path taken:** Path 1 — human blind panel is the only certifying measurement. Eval-lab is wired for Gate 2 self-administered sessions. Until a human session exists, status is **NOT CERTIFIED — awaiting human panel**.

**Proxy retained as diagnostic only:**

- Renamed: **objective prosody proxy v2** (not CMOS)
- Absolute F0 band rewards removed
- Relative anti-flat energy / anti-metronome rate only; news prefers stability a priori
- Never sets `pass: true` or `certified: true`
- Adversarial sanity: `npm run eval:proxy:adversarial`

## Anchor discipline (human panel)

| Anchor | Expected | Enforcement |
|--------|----------|-------------|
| Identical A/B (same wav) | CMOS ≈ 0 | Session invalid if \|CMOS\| > 1 |
| System identity | Hidden until all scores committed | eval-lab UI |

## Objective prosody — flat-affect baseline (Piper)

| Fixture | F0 mean | F0 var | Prosodic diversity |
|---------|---------|--------|--------------------|
| death-scene | 190.84 | 2318.85 | 924.99 |
| picnic | 195.70 | 2300.72 | 1069.16 |
| **ratio** | 0.975 | **1.008** | 0.865 |

**Finding:** death ≈ picnic on Piper. This is the "reads, does not perform" signature. This is **descriptive**, not a Gate 2 pass.

## Content-type engine defaults

| Content | Default engine | Rationale |
|---------|----------------|-----------|
| drama / grief / comedy | **expressive** | emotion + tags |
| dialogue performance | **expressive** | casting + attribution |
| children story | **expressive** | animated style |
| newscast | **piper** | neutral, fast, stable |
| interactive preview | **kokoro** | low RTF |
| long-form chapter job | **expressive** (background) | quality over speed |
| pt-BR | **piper** (default) / expressive pack optional | honest scope |

## Diagnostic proxy on product-path (not certifying)

Re-scored with **objective-prosody-proxy-v2** (no absolute F0 bands):

| Source | mean proxy (expressive vs Piper) | pass? |
|--------|----------------------------------|-------|
| product-path | **−0.25** | no (and not a CMOS gate) |
| directed-final (quarantined) | strongly negative under v2 | INVALID post-hoc DSP |

**Honest engineering conclusion:** on the defensible relative proxy, product-path expressive does **not** beat Piper. Human CMOS is still unrun. A documented “not yet” is the correct shipping claim.

## Product path (wired, quality uncertified)

The product path is implemented:

- Job/REM `exaggeration` → Chatterbox
- `humanize` → breath markers + `directedAudioFilter` via ffmpeg
- Content→affect fallback for plain monologues
- multiControl dialogue keeps document AF neutral

**Wiring ≠ quality certification.** Product-path audio may or may not beat Piper on human CMOS; that is unmeasured until a panel runs.

## Adversarial proxy sanity

See `bench/eval/adversarial/adversarial-report.json` (run `npm run eval:proxy:adversarial`).

- Legacy circular scorer: **rewards** F0-band DSP doctors → INVALID
- objective-prosody-proxy-v2: **must not** reward those doctors

## Pause + WER regression

Pause-probe and WER gates remain on Piper/Kokoro defaults.

## pt-BR honest scope

Primary metrics are **en-US**. pt-BR is best-effort until a dedicated panel.

## Packaging

Installer size unchanged — Expressive Pack is optional download.
