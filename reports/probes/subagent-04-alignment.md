# Probe: Forced alignment (word timestamps)

**Feature:** Forced alignment  
**Verdict:** PARTIAL  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:48Z  
**Server:** `http://127.0.0.1:3848` (workspace-local, RESONARA_LITE=1)

## Summary

Word-timestamp **API surface works** (JSON + VTT/SRT) and the **Needleman–Wunsch aligner unit tests pass**, but the runtime path that should produce `method: "forced"` via Whisper **never runs** on a normal job. Job completion always pre-writes **proportional** `metadata.wordTimestamps` (`estimateWordTimestamps`), so `GET /tts/jobs/:id/timestamps` short-circuits as `method: "cached"`.

Offline proof (Whisper STT on the job WAV + `forcedAlign` from `dist/`) shows the aligner **can** map source words to Whisper word times with monotonic starts and reasonable agreement vs proportional — but that path is not what the HTTP endpoints exercise today.

## Runtime evidence

### 1. POST /tts/synthesize (numbered sentence fixture)

```http
POST http://127.0.0.1:3848/tts/synthesize
Content-Type: application/json

{
  "text": "One two three four five. Six seven eight nine ten.",
  "engine": "piper",
  "language": "en",
  "format": "wav",
  "title": "alignment-probe"
}
```

```json
{
  "id": "954ff296-d33c-4164-8b2b-10f86174c943",
  "status": "queued",
  "wordCount": 10,
  "engine": "piper",
  "format": "wav"
}
```

Poll → `status=completed` after ~12s; `metadata.duration ≈ 3.528s`; output WAV present.

### 2. GET /tts/jobs/:id/timestamps

```http
GET http://127.0.0.1:3848/tts/jobs/954ff296-d33c-4164-8b2b-10f86174c943/timestamps
```

```json
{
  "words": [
    { "word": "One",   "startMs": 0,    "endMs": 271  },
    { "word": "two",   "startMs": 271,  "endMs": 543  },
    { "word": "three", "startMs": 543,  "endMs": 995  },
    { "word": "four",  "startMs": 995,  "endMs": 1357 },
    { "word": "five.", "startMs": 1357, "endMs": 1719 },
    { "word": "Six",   "startMs": 1719, "endMs": 1990 },
    { "word": "seven", "startMs": 1990, "endMs": 2442 },
    { "word": "eight", "startMs": 2442, "endMs": 2895 },
    { "word": "nine",  "startMs": 2895, "endMs": 3256 },
    { "word": "ten.",  "startMs": 3256, "endMs": 3528 }
  ],
  "method": "cached"
}
```

**Checks on these timestamps:**

| Check | Result |
|-------|--------|
| Word order matches source tokens | PASS (10/10) |
| Monotonic non-decreasing starts | PASS |
| Positive durations | PASS |
| Span covers probe duration (~3528 ms) | PASS |
| Matches `estimateWordTimestamps` (char-weighted) | PASS (≤2 ms rounding) |
| `method === "forced"` | **FAIL** → `"cached"` |

These are **proportional** estimates written at job completion (`tts.service.ts` ~L992–1004), not Whisper forced alignment.

### 3. GET /tts/jobs/:id/subtitles

**VTT** (`?format=vtt`):

```text
WEBVTT

00:00:00.000 --> 00:00:02.895
One two three four five. Six seven eight

00:00:02.895 --> 00:00:04.395
nine ten.
```

**SRT** (`?format=srt`): cues present with same timings.  
**JSON** (`?format=json` / timestamps alias): same body as §2, still `method: "cached"`.

### 4. Why forced never runs (code path)

```610:644:src/tts/tts.service.ts
    // Prefer forced alignment via Whisper base when available and not cached
    if (
      !words?.length &&
      job.outputKey &&
      fssync.existsSync(job.outputKey) &&
      this.synthesisQa?.isAvailable()
    ) {
      try {
        const { WhisperService } = await import('../stt/whisper.service');
        const { forcedAlign } = await import('./alignment/forced-aligner');
        // ...
          method = 'forced';
```

Gate requires **empty** `wordTimestamps`. But completion always fills them:

```992:1005:src/tts/tts.service.ts
      const durationMs = (duration || 0) * 1000;
      const wordTimestamps =
        durationMs > 0
          ? estimateWordTimestamps(job.text, durationMs)
          : undefined;
      const meta: TtsJobMetadata = {
        ...(job.metadata || {}),
        // ...
        wordTimestamps,
      };
```

Therefore HTTP always returns `method: "cached"` for completed jobs with duration. Whisper is available (`GET /stt/health` → available) but unused for this endpoint under normal operation.

Note: lite mode uses **sql.js** in-memory DB (`autoSave` to `~/.resonara/data/resonara.db`); external SQLite edits do not affect the live process — forced path cannot be “unlocked” without an API/code change.

### 5. Offline forced alignment on the same fixture (algorithm + Whisper)

```http
POST /stt/transcribe  (multipart speech.wav, language=en)
```

Whisper (tiny) transcript: `"1, 2, 3, 4, 5, 6, 7, 8, 9, 10."` with 10 word timestamps.

`normalizeForWer` maps digits ↔ words (`"1," → ["one"]`, `"One" → ["one"]`), so NW alignment anchors all 10 source tokens:

| word | prop start | forced start | Δ start | confidence |
|------|------------|--------------|---------|------------|
| One | 0 | 0 | 0 | anchored |
| two | 271 | 440 | +169 | anchored |
| three | 543 | 600 | +57 | anchored |
| four | 995 | 880 | −115 | anchored |
| five. | 1357 | 1080 | −277 | anchored |
| Six | 1719 | 2200 | +481 | anchored |
| seven | 1990 | 2560 | +570 | anchored |
| eight | 2442 | 2800 | +358 | anchored |
| nine | 2895 | 2960 | +65 | anchored |
| ten. | 3256 | 3440 | +184 | anchored |

- **anchored:** 10/10, **interpolated:** 0  
- **monotonic starts:** true  
- **within 500 ms of proportional start:** 9/10 (word “seven” at +570 ms)  
- Zero-duration edge: Whisper reported `ten.` as `startMs=endMs=3440` (propagated by aligner)

This proves the **aligner + Whisper** stack works offline; it is **not** what `/timestamps` returns today.

### 6. Jest: `src/tts/alignment/forced-aligner.spec.ts`

```text
PASS src/tts/alignment/forced-aligner.spec.ts
  forcedAlign
    ✓ exact match anchors all words
    ✓ interpolates missing whisper words
    ✓ mergeChunkAlignments applies offsets
    ✓ wordIndexAtTime binary search
    ✓ groupSentences

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

## Gaps

1. **Forced path dead at runtime:** completion pre-caches proportional `wordTimestamps` → `getSubtitles` never calls Whisper/`forcedAlign`; API never returns `method: "forced"`.
2. **No way to request re-alignment** (query flag / force refresh) once proportional times are stored.
3. **Proportional ≠ spoken timing:** numbered list has real pause structure (sentence gap, uneven word lengths); proportional ignores acoustics (offline forced differs by up to ~570 ms on this fixture).
4. **Whisper zero-length words** can yield `startMs === endMs` after anchoring (seen on “ten.”).

## Suggested fix (S)

- On complete: either omit `wordTimestamps`, or store them with `alignmentMethod: "proportional"` and allow upgrade.
- In `getSubtitles`: if Whisper available and `alignmentMethod !== "forced"`, run forced alignment (or honor `?force=1` / `?method=forced`).
- Optionally clamp zero-duration words to a minimum (e.g. 30–40 ms) after align.

## Structured

```json
{
  "feature": "Forced alignment",
  "verdict": "PARTIAL",
  "gaps": [
    "GET /timestamps returns method=cached (proportional); Whisper forced path never runs because completion pre-writes wordTimestamps",
    "No API flag to re-run forced alignment after proportional cache",
    "Proportional times ignore acoustics; offline forced differs up to ~570ms on numbered fixture",
    "Whisper can emit zero-duration words (startMs===endMs) that propagate through forcedAlign"
  ],
  "fixEstimate": "S"
}
```
