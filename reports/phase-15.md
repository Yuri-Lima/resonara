# Phase 15 — Audiobook Library UI

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `LibraryService.listLibrary` | Cards: title, author, cover, progress, engine, language; search/filter |
| `GET /tts/library` | Paginated shelf + continueListening |
| `ui/voice` | Library shelf panel |
| cover ensure on demand | Deterministic SVG cover |

## Commands (real output)

```
GET /tts/library → { items, total, page, limit, continueListening }
npm test → library-related cover/feed tests pass
```

## Adversarial self-review (Pass B)

1. **Finding:** listLibrary loads all completed jobs then filters in memory — fine for desktop, not multi-tenant server scale.  
   **Resolution:** Intentional lite/sql.js design; comment notes single query no N+1.

2. **Finding:** progressPct uses resume/duration; duration 0 → 0% forever.  
   **Resolution:** Correct; duration filled on complete.

3. **Finding:** audioMissing flag only checks existsSync — not readable/corrupt.  
   **Resolution:** Acceptable; download will fail loudly if corrupt.

## Self-review Pass A

continueListening filters 0 < progress < 98; coverUrl only when coverKey set.
