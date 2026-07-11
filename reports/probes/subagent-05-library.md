# Probe: Library endpoint + resume + covers

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:15:47.000Z  
**Server:** http://127.0.0.1:3848  
**Job:** `45e7ab19-4563-450f-bcc3-bf0b5f0523a3`  
**Title:** `Library Probe Book 1783808102`

## What was tested

1. `POST /tts/synthesize` with short text + explicit `title` + `engine: piper` → wait until `completed`
2. `GET /tts/library?q=Library%20Probe` — job listed with title
3. `POST /tts/jobs/:id/bookmarks` with `positionMs` + note; `GET` bookmarks back
4. `PATCH /tts/jobs/:id/resume` with same `positionMs` (resume position surface)
5. `GET /tts/jobs/:id/cover` — SVG cover returned (`image/svg+xml`)

## Results summary

| Check | Result |
|---|---|
| Synthesize completed job with title | PASS (status=completed, metadata.title set) |
| GET /tts/library lists job | PASS (HTTP 200, job_listed=true, title match) |
| POST bookmarks with positionMs | PASS (HTTP 201, id returned) |
| GET bookmarks returns positionMs | PASS (HTTP 200, positionMs=12345, note preserved) |
| PATCH resume positionMs | PASS (HTTP 200, `{positionMs:12345}`) |
| GET cover returns SVG/image | PASS (HTTP 200, Content-Type: image/svg+xml, 985 bytes valid SVG) |
| coverUrl appears on library card after cover gen | PASS (lazy; present after first GET cover) |

## Evidence 1 — synthesize

```
POST /tts/synthesize
→ 201-ish body (queued → completed in ~7s)

{
  "id": "45e7ab19-4563-450f-bcc3-bf0b5f0523a3",
  "status": "completed",
  "progress": 100,
  "engine": "piper",
  "metadata": {
    "title": "Library Probe Book 1783808102",
    "language": "en",
    "wordCount": 12
  },
  "downloadPath": "/tts/jobs/45e7ab19-4563-450f-bcc3-bf0b5f0523a3/download",
  "outputPath": ".../45e7ab19-4563-450f-bcc3-bf0b5f0523a3/speech.wav"
}
```

## Evidence 2 — library list

```
GET /tts/library?q=Library%20Probe → 200

{
  "items": [
    {
      "id": "45e7ab19-4563-450f-bcc3-bf0b5f0523a3",
      "title": "Library Probe Book 1783808102",
      "author": "Resonara",
      "duration": 4.55175,
      "engine": "piper",
      "language": "en",
      "progressPct": 0,
      "resumePositionMs": 0,
      "audioMissing": false
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 24,
  "continueListening": []
}
```

After resume + cover:

```
{
  "id": "45e7ab19-4563-450f-bcc3-bf0b5f0523a3",
  "title": "Library Probe Book 1783808102",
  "coverUrl": "/tts/jobs/45e7ab19-4563-450f-bcc3-bf0b5f0523a3/cover",
  "progressPct": 100,
  "resumePositionMs": 12345,
  "audioMissing": false
}
```

## Evidence 3 — bookmarks + resume

```
POST /tts/jobs/45e7ab19-4563-450f-bcc3-bf0b5f0523a3/bookmarks
Body: {"positionMs":12345,"note":"probe resume"}
→ 201
{
  "jobId": "45e7ab19-4563-450f-bcc3-bf0b5f0523a3",
  "positionMs": 12345,
  "note": "probe resume",
  "id": "c53364dd-a688-4cd4-a821-3d914f115f7a",
  "createdAt": "2026-07-11T22:15:40.000Z"
}

GET /tts/jobs/45e7ab19-4563-450f-bcc3-bf0b5f0523a3/bookmarks → 200
[
  {
    "id": "c53364dd-a688-4cd4-a821-3d914f115f7a",
    "jobId": "45e7ab19-4563-450f-bcc3-bf0b5f0523a3",
    "positionMs": 12345,
    "note": "probe resume",
    "createdAt": "2026-07-11T22:15:40.000Z"
  }
]

PATCH /tts/jobs/45e7ab19-4563-450f-bcc3-bf0b5f0523a3/resume
Body: {"positionMs":12345}
→ 200 {"positionMs":12345}
```

## Evidence 4 — cover

```
GET /tts/jobs/45e7ab19-4563-450f-bcc3-bf0b5f0523a3/cover → 200
Content-Type: image/svg+xml
Size: 985 bytes
file(1): SVG Scalable Vector Graphics image

<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 1400 1400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(152.6, 42%, 18%)"/>
      <stop offset="100%" stop-color="hsl(192.6, 55%, 48%)"/>
    </linearGradient>
  </defs>
  ...
  <!-- title text includes "Library Probe Book 1783808102" -->
</svg>
```

## Gaps

- **Resume not clamped to duration:** `positionMs=12345` accepted on a ~4.55s (4551ms) clip → `progressPct` caps at 100. Bookmarks/resume APIs do not validate against audio length.
- **coverUrl lazy-only:** Library card omits `coverUrl` until first `GET .../cover` (or other path that calls `ensureCover`). Not broken — just delayed discovery for UI that relies on list payload alone.
- **continueListening empty at 100%:** Expected filter (`0 < progressPct < 98`); overshot resume hides the item from continue-listening rail.

None of these block the core library / bookmark / cover runtime path.

## Structured

```json
{
  "feature": "Library endpoint + resume position + covers",
  "verdict": "WORKING",
  "gaps": [
    "Resume/bookmark positionMs not clamped to job duration (progressPct can hit 100% past EOF)",
    "coverUrl omitted from library card until ensureCover runs (lazy generation)",
    "continueListening excludes items at progressPct>=98 (expected; overshot resume empties rail)"
  ],
  "fixEstimate": "S"
}
```
