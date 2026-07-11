# Probe: Whisper STT (subagent-02)

**Feature:** Whisper STT (`POST /stt/transcribe`, `GET /stt/health`)  
**Verdict:** WORKING  
**Fix estimate:** S (ops only — ensure runtime binds this workspace + `node scripts/download-whisper.js` once)  
**Timestamp:** 2026-07-11T22:16:24Z  
**Server under test:** `http://127.0.0.1:3848` (this workspace `trace-swe23`; see port note)

## Port note (critical)

Context specified `http://127.0.0.1:3847`, but that port is occupied by a **stale process from another workspace**:

| Port | PID | CWD | Whisper available? |
|------|-----|-----|--------------------|
| **3847** | 15469 | `/private/tmp/trace-swe22-20260711-014507` | **false** (no `tools/whisper-venv`) |
| **3848** | 74374 | `/private/tmp/trace-swe23-20260712-000916` | **true** |
| **3855** | 73597 | `/private/tmp/trace-swe23-20260712-000916` | **true** |

Feature-truth for **this repo** is proven on **:3848** (and confirmed available on :3855).  
On the literal :3847 endpoint, STT is **BROKEN** only because a foreign process holds the port without Whisper installed.

## Steps executed

### 1. GET /stt/health

**On :3848 (this repo):**
```json
{"available":true,"python":"/private/tmp/trace-swe23-20260712-000916/tools/whisper-venv/bin/python","script":"/private/tmp/trace-swe23-20260712-000916/tools/whisper/transcribe.py","detail":"faster-whisper (tools/whisper-venv)"}
```

**On :3847 (stale swe22 — context port):**
```json
{"available":false,"detail":"faster-whisper not installed. Run: node scripts/download-whisper.js"}
```

### 2. Create real WAV via TTS

```bash
curl -s -X POST http://127.0.0.1:3848/tts/synthesize \
  -H 'Content-Type: application/json' \
  -d '{"text":"The quick brown fox jumps over the lazy dog","format":"wav","engine":"piper"}'
```

Job `505b45a2-f255-4e7f-aa16-06b3e42bd458` → `status: completed`.

Downloaded:
```bash
curl -sL -o reports/probes/fixtures/whisper-probe-fox.wav \
  http://127.0.0.1:3848/tts/jobs/505b45a2-f255-4e7f-aa16-06b3e42bd458/download
```

```
reports/probes/fixtures/whisper-probe-fox.wav: RIFF (little-endian) data, WAVE audio, mono 48000 Hz
size: 373896 bytes
```

### 3. POST /stt/transcribe (multipart)

```bash
curl -s -X POST http://127.0.0.1:3848/stt/transcribe \
  -F "file=@reports/probes/fixtures/whisper-probe-fox.wav;type=audio/wav"
```

**HTTP status:** `201`  
**Wall time:** ~2.9s (model already cached under `tools/whisper/models/`)

### 4. Transcript verification

**Expected source text:** `The quick brown fox jumps over the lazy dog`  
**Transcript text:** `The quick brown fox jumps over the lazy dog.`

| Expected word | Present in transcript? |
|---------------|------------------------|
| the | yes |
| quick | yes |
| brown | yes |
| fox | yes |
| jumps | yes |
| over | yes |
| lazy | yes |
| dog | yes |

**All expected content words present. Exact sentence match (period only difference).**

Full response (trimmed structure preserved):
```json
{
  "text": "The quick brown fox jumps over the lazy dog.",
  "segments": [
    {
      "text": "The quick brown fox jumps over the lazy dog.",
      "startMs": 0,
      "endMs": 2500,
      "words": [
        {"word": "The", "startMs": 0, "endMs": 160},
        {"word": "quick", "startMs": 160, "endMs": 420},
        {"word": "brown", "startMs": 420, "endMs": 760},
        {"word": "fox", "startMs": 760, "endMs": 1100},
        {"word": "jumps", "startMs": 1100, "endMs": 1440},
        {"word": "over", "startMs": 1440, "endMs": 1740},
        {"word": "the", "startMs": 1740, "endMs": 1880},
        {"word": "lazy", "startMs": 1880, "endMs": 2100},
        {"word": "dog.", "startMs": 2100, "endMs": 2500}
      ]
    }
  ],
  "language": "en",
  "durationMs": 2596,
  "model": "tiny",
  "elapsedMs": 548
}
```

Word-level timestamps: **9 words** returned (required for QA Phase 6 / alignment Phase 10).

### 5. Negative control (context port :3847)

```bash
curl -s -X POST http://127.0.0.1:3847/stt/transcribe \
  -F "file=@reports/probes/fixtures/whisper-probe-fox.wav;type=audio/wav"
```
```json
{"message":"faster-whisper not installed. Run: node scripts/download-whisper.js","error":"Bad Request","statusCode":400}
```

## Evidence summary

| Check | Result |
|-------|--------|
| Health available (this workspace) | true |
| faster-whisper venv + script present | yes |
| Models cached (`tiny.ready`, `base.ready`) | yes |
| Real WAV synthesized (piper) | yes, mono 48kHz WAV |
| Multipart upload accepted | HTTP 201 |
| Transcript contains expected words | **yes — exact match** |
| Word timestamps | yes (9 words) |
| Language | en |
| Model used by API | tiny |
| Transcribe elapsedMs | 548 |

## Gaps

1. **Port collision / wrong process on :3847** — probe context port serves stale `trace-swe22` without Whisper; this is an environment/ops issue, not a code defect in `WhisperService`.
2. **Install gate** — `isAvailable()` only checks python binary + script path existence; does not verify models are present. First call without models would download (or fail offline).
3. **Default model hard-coded to `tiny`** in `stt.controller.ts` — fine for latency, lower accuracy than `base`/`small` for hard audio.
4. **No authenticated/rate-limit surface testing** — unauthenticated local API only.
5. **Only English phrase proven** — pt-BR STT not exercised in this probe.

## Fix estimate

| Item | Size | Notes |
|------|------|-------|
| Kill stale :3847 or bind this workspace to RESONARA_PORT | **S** | Ops; no code change required for STT itself |
| Bundle whisper-venv + tiny model in installer | **M** | Packaging (already called out in FEATURE_TRUTH risk notes) |
| Code path for STT | **none** | Runtime path WORKS end-to-end |

## Decision recommendation

**KEEP** — Whisper STT is WORKING end-to-end on this workspace when the correct server process is used: synthesize → download WAV → multipart transcribe → exact expected words + word timestamps.

## Code paths exercised

- `src/stt/stt.controller.ts` — `GET health`, `POST transcribe` (multer `file` field)
- `src/stt/whisper.service.ts` — `isAvailable`, `getVersion`, `transcribe` → spawn `tools/whisper/transcribe.py`
- `tools/whisper/transcribe.py` — faster-whisper tiny, CPU int8, word timestamps
