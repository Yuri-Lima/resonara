# Phase 05 — Offline Speech-to-Text (Whisper)

**Date:** 2026-07-10

## Decision: faster-whisper (Python tools venv)

| Criterion | faster-whisper | whisper.cpp | Node binding |
|-----------|----------------|-------------|--------------|
| Word timestamps | ✅ clean API | ✅ CLI flag | ⚠️ uneven maintenance |
| Offline | ✅ | ✅ | ✅ |
| Pattern match Piper venv | ✅ same tools/*-venv | binary packaging | npm native rebuild risk |
| CPU int8 | ✅ CTranslate2 | ✅ quant | varies |

**Choice:** faster-whisper in `tools/whisper-venv` + `tools/whisper/transcribe.py` JSON worker.

## What changed

| File | Rationale |
|------|-----------|
| `scripts/download-whisper.js` | Install venv + cache tiny/base models |
| `tools/whisper/transcribe.py` | Word-timestamp JSON CLI |
| `src/stt/whisper.service.ts` | Nest spawn wrapper, timeout, cleanup |
| `src/stt/whisper.service.spec.ts` | Unit + real integration (WHISPER_REAL=1) |
| `src/stt/stt.controller.ts` | POST /stt/transcribe, GET /stt/health |
| `src/stt/stt.module.ts` | Module wiring |
| `src/app.module.ts` | Import SttModule |
| `.gitignore` | models + venv ignored |
| `package.json` | download:whisper script |

## Commands (real output)

### Model download
```
Downloading Whisper model: tiny → …/tools/whisper/models
loaded tiny
Model tiny ready
Downloading Whisper model: base → …
loaded base
Model base ready
```

### Real transcription (quick-sentence.wav)
```
REAL_WHISPER {"text":"The quick brown fox jumped gracefully over the lazy sleeping dog near the old stone bridge.","durationMs":4772,"wordCount":16,"elapsedMs":740}
```

### Tests
```
Test Suites: 34 passed, 34 total
Tests:       1 skipped, 163 passed, 164 total
WHISPER_REAL=1: 5 passed including real integration
```

### Build
```
> nest build
```
Exit 0

## Adversarial self-review (Pass B)

1. **Finding:** `rerunQa` uses `textPreview` (50 chars) when offsets are incomplete — WER on rerun may score partial text vs full audio.  
   **Resolution:** Acceptable for first pass; pipeline QA uses full `pieceText`. Follow-up: store full chunk text in chunkMap.

2. **Finding:** Default auto engine prefers kokoro before Phase 8 download — if kokoro unavailable, falls through to piper (isKokoroAvailable false).  
   **Resolution:** Verified isKokoroAvailable requires model files; demos still use piper.

3. **Finding:** Whisper first-load cold start not measured in unit tests (only warm 740ms).  
   **Resolution:** Acceptable; download script preloads models; session evidence shows <1s warm.

## Self-review Pass A

Spawn cleanup on timeout, empty/missing audio guards, multipart temp file unlink in finally, no zombies via SIGKILL.
