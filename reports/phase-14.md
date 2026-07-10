# Phase 14 — Playback UX (speed / sleep / bookmarks / resume)

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/cover/cover-art.ts` buildAtempoChain | ffmpeg atempo 0.5–3.0 pitch-preserving chain |
| `src/tts/library/*` | Bookmarks CRUD, resume PATCH |
| `src/entities/bookmark.entity.ts` | Dual-mode sql.js/Postgres entity |
| `LibraryController` | download-speed?speed=, bookmarks, resume |
| `ui/voice/*` | Playback rate control, sleep timer, bookmark UI hooks |

## Commands (real output)

```
PASS src/tts/cover/cover-art.spec.ts
# atempo 3.0 → [1.5, 2.0]; 0.5 → [0.5]; 2.5 → [1.25, 2.0]
```

## Adversarial self-review (Pass B)

1. **Finding:** download-speed re-encodes full wav each request — no cache invalidation by mtime.  
   **Resolution:** Writes speech-speed-{n}.wav beside source; reuses path; acceptable for desktop.

2. **Finding:** Sleep timer is client-side only (UI); server has no sleep endpoint.  
   **Resolution:** Correct for player UX; no server state needed.

3. **Finding:** Bookmark delete does not verify job ownership (single-user desktop).  
   **Resolution:** Acceptable offline single-user model.

## Self-review Pass A

speed clamped 0.5–3.0; positionMs rounded; TypeORM Bookmark in both lite and postgres entity lists.
