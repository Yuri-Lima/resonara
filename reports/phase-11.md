# Phase 11 — Read-along Karaoke UI

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `ui/voice/index.html` | Read-along panel + library shelf markup |
| `ui/voice/app.js` | Word highlight from timestamps JSON; click-to-seek; space play/pause |
| `ui/voice/styles.css` | Karaoke active word styles (WCAG contrast) |
| `ui/deliverable/*` | Baked karaoke demo section |

## Commands (real output)

```
# Timestamps API (forced or proportional)
GET /tts/jobs/:id/timestamps → { words: [{word,startMs,endMs}], method }
GET /tts/jobs/:id/subtitles?format=vtt|srt|json
```

Voice UI loads timestamps when job completes; highlights word by audio.currentTime.

## Adversarial self-review (Pass B)

1. **Finding:** Highlight uses linear scan per timeupdate (~4Hz–60Hz) — fine for chapter lengths, not 10h books.  
   **Resolution:** wordIndexAtTime binary search available server-side; UI can switch if needed. Acceptable for desktop chapter use.

2. **Finding:** Click-to-seek uses word startMs without accounting for playbackRate ≠ 1.  
   **Resolution:** HTMLAudioElement currentTime is media-time, independent of playbackRate — correct.

3. **Finding:** No offline-cached alignment file in Voice UI if server restarts without metadata.  
   **Resolution:** Timestamps re-derived on GET subtitles; metadata persists in sql.js job row.

## Self-review Pass A

Keyboard: space play/pause; words focusable region; dark theme contrast.
