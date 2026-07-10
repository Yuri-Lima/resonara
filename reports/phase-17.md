# Phase 17 — Podcast RSS Re-emit

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/feeds/podcast-feed.ts` | buildPodcastRss + feedsEnabled (RESONARA_FEEDS) |
| `src/tts/feeds/podcast-feed.spec.ts` | XML structure / escape tests |
| `LibraryController` | GET /feeds, GET /feeds/:jobId/rss.xml |

## Commands (real output)

```
PASS src/tts/feeds/podcast-feed.spec.ts
# Security: feeds disabled unless RESONARA_FEEDS=1 (LAN, unauthenticated)
```

## Adversarial self-review (Pass B)

1. **Finding:** Feeds unauthenticated — any LAN client can pull library audio URLs.  
   **Resolution:** Documented; default OFF; ServiceUnavailableException when disabled.

2. **Finding:** Chapter enclosure lengthBytes=0 when chapter files not sized.  
   **Resolution:** Full-book path uses real size; chapter size optional.

3. **Finding:** RESONARA_PUBLIC_URL default 127.0.0.1 — podcast apps on other devices need LAN IP.  
   **Resolution:** Env override documented.

## Self-review Pass A

XML escape; iTunes image; guid per episode.
