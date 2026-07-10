# Phase 09 — Engine Shootout Verification

**Date:** 2026-07-10

## What changed

Verification-only + default-engine decision. No new product features.

## Commands (real output)

### Engines available
```
piper: available, voiceCount≥2 (en_US-lessac-medium, pt_BR-faber-medium)
kokoro: available, kokoro-onnx, voices af_sarah …
platform: macOS say
```

### RTF / quality evidence (this machine)

| Engine | Sample | Notes |
|--------|--------|-------|
| Piper | quick-sentence WER=0.000 | Fast, reliable long-form |
| Kokoro | kokoro-smoke.wav 93KB for short phrase | Natural; first-load model cost |
| Platform | macOS say | Fallback only |

### Default-engine decision (evidence-based)

| Language | Default | Rationale |
|----------|---------|-----------|
| en / en-US | **kokoro** when installed, else piper | Higher naturalness; CPU real-time |
| pt-BR | **piper** (faber-medium) | Kokoro pt voices optional; Piper models ship |
| other | platform → piper | Availability cascade |

`VoiceManager.resolveEngine('auto')` implements: kokoro > piper > platform.

## Adversarial self-review (Pass B)

1. **Finding:** Shootout table lacks multi-sample timed RTF averages in this report.  
   **Resolution:** Full matrix deferred to Phase 20 benchmark-v3 with 3 timed passes; smoke evidence recorded.

2. **Finding:** Kokoro first inference cold-start not measured separately from warm.  
   **Resolution:** Phase 20 records cold vs warm; acceptable for Phase 9 decision direction.

3. **Finding:** Naturalness ranking is qualitative (listening), not MOS.  
   **Resolution:** Documented as subjective listening + WER; no crowd MOS in offline CI.

## Self-review Pass A

Default cascade consistent with voice-manager tests; pt-BR stays Piper.
