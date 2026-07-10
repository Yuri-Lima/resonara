# Phase 05 — Offline Whisper STT

**Date:** 2026-07-11

## What changed

| File | Rationale |
|------|-----------|
| `src/stt/whisper.service.ts` | Spawn faster-whisper with timeout/cleanup |
| `src/stt/stt.controller.ts` | POST /stt/transcribe |
| `scripts/download-whisper.js` | venv + tiny/base models |
| `tools/whisper/transcribe.py` | CLI JSON helper (word timestamps) |

## Decision

**faster-whisper** in tools/whisper-venv (int8 CPU). Criteria: word timestamps required for Phase 10, same venv pattern as Piper, maintenance via pip.

## Commands (real output)

```
Model tiny ready
Model base ready
Done. Python: tools/whisper-venv/bin/python
```

Real transcription:
```
TRANSCRIPT: The quick brown fox jumped gracefully over the lazy sleeping dog near the old stone bridge.
WORDS: 16  FIRST startMs≈0  LAST endMs≈4940
```

Unit tests:
```
PASS src/stt/whisper.service.spec.ts
```

## Adversarial self-review (Pass B)

1. **Finding:** isAvailable() only checks python+script paths, not model cache — first call may download.  
   **Resolution:** Acceptable; models pre-downloaded via script with markers.

2. **Finding:** spawnJson kills with SIGKILL on timeout — no graceful cancel of CTranslate2.  
   **Resolution:** Acceptable for CPU worker; timeout default 120s prevents hang.

3. **Finding:** Empty/zero-byte audio throws before spawn — good; missing language defaults to en.  
   **Resolution:** Documented; multilingual STT out of scope for QA gate.

## Self-review Pass A

Resource cleanup on error paths present; no unhandled rejections in spawnJson finish guard.
