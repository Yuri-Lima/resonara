# Phase 18 — CLI + Watch Folder

**Date:** 2026-07-11

## What changed

| File | Rationale |
|------|-----------|
| `scripts/resonara-cli.js` | synth/voices/engines/jobs/watch |

## Commands (real output)

### engines
```
kokoro available=true voiceCount=10 primary=true
piper available=true voiceCount=2
platform available=true voiceCount=184
```

### synth
```
Job 7e0ac816-5815-479a-874e-364a0f968307 ....
output: demo-output/cli/quick-sentence.wav
bytes: 216266
```

### watch
```
[watch] watching /tmp/resonara-watch-in → /tmp/resonara-watch-out
[watch] synthesizing /tmp/resonara-watch-in/sample.md
[watch] done /tmp/resonara-watch-out/sample.wav
```
Marker: `sample.md.done` written; watcher terminated after test.

## Adversarial self-review (Pass B)

1. **Finding:** Watch mode concurrency=1 queues further drops — rapid multi-file drops wait serially.  
   **Resolution:** By design for CPU TTS; documented.

2. **Finding:** CLI ensureServer starts detached lite server without PID file if none running.  
   **Resolution:** Acceptable for DX; Phase 24 kills orphans via process check.

3. **Finding:** synth --qa full depends on Whisper availability; silent null QA if missing.  
   **Resolution:** Fixed by shipping transcribe.py; qa report surfaces null when off.

## Self-review Pass A

Exit codes, --help present; watch terminated after proof.
