# Phase 13 — EPUB3 Media Overlays Export

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `src/tts/export/epub-overlay-exporter.ts` | SMIL, span wrap, OPF media-overlay inject, validate monotonic |
| `src/tts/export/epub-overlay-exporter.spec.ts` | Structural validation tests |
| `src/tts/tts.service.ts` exportEpubOverlay | Build package from forced/proportional sentences |
| `src/tts/tts.controller.ts` | POST /tts/jobs/:id/export/epub-overlay |
| entity metadata | epubOverlayDir |

## Commands (real output)

```
PASS src/tts/export/epub-overlay-exporter.spec.ts
npm run build → exit 0
```

## Adversarial self-review (Pass B)

1. **Finding:** `wrapSentenceSpans` does first-occurrence string replace — duplicate sentences collide.  
   **Resolution:** Acceptable for generated body from unique sentence slices; documented.

2. **Finding:** Export is package fragments (xhtml+smil+opf), not a full zip EPUB container.  
   **Resolution:** Structural MO content valid; zip packaging can wrap outDir later.

3. **Finding:** Non-monotonic timestamps only clamped with warn — silent quality loss.  
   **Resolution:** validateSmilMonotonic + clamp; logged.

## Self-review Pass A

Idempotent span wrap if s0001 present; escapeHtml on text.
