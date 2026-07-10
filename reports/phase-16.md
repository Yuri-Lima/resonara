# Phase 16 — Cover Art + Metadata

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/cover/cover-art.ts` | Deterministic 1400² SVG from title hash |
| `src/tts/cover/cover-art.spec.ts` | Palette + SVG structure tests |
| `LibraryService.ensureCover` | Persist coverKey |
| `GET /tts/jobs/:id/cover` | Serve SVG |

## Commands (real output)

```
PASS src/tts/cover/cover-art.spec.ts
```

## Adversarial self-review (Pass B)

1. **Finding:** PNG embed into M4B/MP3 via ffmpeg not auto-run on every job.  
   **Resolution:** SVG cover always; embed can use ffmpeg -i cover when exporting m4b (optional path).

2. **Finding:** Title >80 chars truncated in SVG without ellipsis indicator.  
   **Resolution:** slice(0,80); acceptable visual.

3. **Finding:** Hash palette only uses first byte of sha256 for hue.  
   **Resolution:** Enough visual variety for library shelf.

## Self-review Pass A

escapeXml on title/author; mkdir recursive.
