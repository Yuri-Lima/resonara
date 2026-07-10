# Phase 08 — Kokoro Neural Engine

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/kokoro-tts.ts` | Adapter: isAvailable, listVoices, synthesizeWithKokoro |
| `scripts/download-kokoro.js` | Venv + kokoro-onnx + model/voices download + synthesize.py |
| `src/tts/voice-manager.ts` | Third engine; auto prefers kokoro; engine-aware defaultVoice |
| `src/tts/tts.service.ts` | synthesizeOne kokoro path; resolveVoice engine-first |
| `src/tts/voice-manager.spec.ts` | Kokoro mock + prefer-kokoro / none-available cases |
| `.gitignore` | tools/kokoro-venv, tools/kokoro/models |

## Commands (real output)

### Model download
```
tools/kokoro/models/kokoro-v1.0.onnx  325532387 bytes
tools/kokoro/models/voices-v1.0.bin    28214398 bytes
kokoro_onnx ok
```

### Smoke synthesis
```
tools/kokoro-venv/bin/python tools/kokoro/synthesize.py --text "Hello from Kokoro on Resonara." --out demo-output/kokoro-smoke.wav --voice af_sarah
-rw-r--r--  demo-output/kokoro-smoke.wav  93228 bytes
```

### API auto → kokoro:af_sarah
```
{"voice":"kokoro:af_sarah","engine":"auto",... status completed}
```

### Bug fixed this phase
Default voice for engine=kokoro previously resolved to `piper:en_US-lessac-medium` via getDefaultVoiceForLanguage, causing AssertionError. Fixed: defaultVoice('kokoro') → af_sarah; resolveVoice prefers engine-specific default.

## Adversarial self-review (Pass B)

1. **Finding:** `isKokoroAvailable()` true if python + models dir exist even when ONNX corrupt.  
   **Resolution:** synthesize path validates output file size; download script caches by size >1MB. Acceptable offline heuristic.

2. **Finding:** `listKokoroVoices` hardcodes ~10 English ids; full voice pack has more.  
   **Resolution:** Documented subset for G27; nativeId pass-through allows any voices.bin id.

3. **Finding:** Auto default to Kokoro changes production path for all demos.  
   **Resolution:** Intentional per roadmap; QA pins QA_ENGINE=piper; demos may set engine=piper for speed.

## Self-review Pass A

Timeout 120s, empty-output check, SIGKILL on timeout, engine type cascade through VoiceManager/chunker.
