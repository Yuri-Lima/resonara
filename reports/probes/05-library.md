# Probe: Library

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:03.131Z

## Evidence

```
synth ok=true id=05966a62-407b-448c-9168-54cbb0828d06

GET /tts/library → 200
{
  "items": [
    {
      "id": "05966a62-407b-448c-9168-54cbb0828d06",
      "title": "Library Probe Title",
      "author": "Resonara",
      "duration": 3.148625,
      "engine": "kokoro",
      "language": "en",
      "progressPct": 0,
      "resumePositionMs": 0,
      "audioMissing": false,
      "updatedAt": "2026-07-11T22:16:02.000Z",
      "createdAt": "2026-07-11T22:16:00.000Z"
    },
    {
      "id": "d5f316d9-6550-46bb-bd14-0f9dc0b0c2b1",
      "title": "pt-br-auto-voice",
      "author": "Resonara",
      "duration": 5.608299,
      "engine": "piper",
      "language": "pt-BR",
      "progressPct": 0,
      "resumePositionMs": 0,
      "audioMissing": false,
      "updatedAt": "2026-07-11T22:16:01.000Z",
      "createdAt": "2026-07-11T22:15:53.000Z"
    },
    {
      "id": "31fba954-d532-4a25-afab-b44b69332f21",
      "title": "align-probe",
      "author": "Resonara",
      "duration": 2.837375,
      "engine": "kokoro",
      "language": "en",
      "progressPct": 0,
      "resumePositionMs": 0,
      "audioMissing": false,
      "updatedAt": "2026-07-11T22:15:58.000Z",
      "createdAt": "2026-07-11T22:15:56.000Z"
    },
    {
      "id": "16711aa6-5410-4d98-a390-945dcb8a45c5",
      "title": "qa-probe",
      "author": "Resonara",
      "duration": 3.368458,
      "engine": "kokoro",
      "language": "en",
      "progressPct": 0,
      "resumePositionMs": 0,
      "audioMissing": false,
      "updatedAt": "2026-07-11T22:15:55.000Z",
      "createdAt": "2026-07-11T22:15:47.000Z"
    },
    {
      "id": "23a86a4b-ce08-45d8-8595-b8f080c2214f",
      "title": "The quick brown fox jumped gracefully over the l",
      "author": "Resonara",
      "duration": 4.773104,
      "engine": "auto",
      "language": "en",
      "coverUrl": "/tts/jobs/23a86a4b-ce08-45d8-8595-b8f080c2214f/cover",
      "progressPct": 0,
      "resumePositionMs": 0,
      "audioMissing": false,
      "updatedAt": "2026-07-11T22:15:48.000Z",
      "createdAt": "2026-07-09T20:04:42.000Z"
    },
    {
      "id": "45e7ab19-4563-450f-bcc3-bf0b5f0523a3",
      "title": "Library Probe Book 1783808102",
      "author": "Resonara",
      "duration": 4.55175,
      "engine": "piper",
      "language": "en",
      "coverUrl": "/tts/jobs/45e7ab19-4563-450f-bcc3-bf0b5f0523a3/cover",
      "progressPct": 100,
      "resumePositionMs": 12345,
      "audioMissing": false,
      "updatedAt": "2026-07-11T22:15:44.000Z",
      "createdAt": "2026-07-11T22:15:15.000Z"
    },
    {
      

POST bookmark → 201 {"jobId":"05966a62-407b-448c-9168-54cbb0828d06","positionMs":1500,"note":"probe","id":"aa48416f-eb65-4186-8a52-0f38101b7c67","createdAt":"2026-07-11T22:16:03.000Z"}

GET bookmarks → 200 [{"id":"aa48416f-eb65-4186-8a52-0f38101b7c67","jobId":"05966a62-407b-448c-9168-54cbb0828d06","positionMs":1500,"note":"probe","createdAt":"2026-07-11T22:16:03.000Z"}]

GET cover → 200 ct=image/svg+xml bytes=1001
```

## Gaps

- (none)

## Structured

```json
{
  "feature": "Library",
  "verdict": "WORKING",
  "gaps": [],
  "fixEstimate": "S"
}
```
