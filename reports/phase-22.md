# Phase 22 — Deliverable Dashboard Update

**Date:** 2026-07-10

## What changed

| File | Rationale |
|------|-----------|
| `ui/deliverable/index.html` | Competitive matrix, QA, engines, karaoke, library, CLI panels |
| `ui/deliverable/app.js` | Interactive matrix + charts + baked karaoke |
| `ui/deliverable/styles.css` | Dark theme, WCAG AA focus |
| `scripts/open-ui.sh` | Canonical open |
| `Makefile` | `make ui` target |

## Commands (real output)

```
make ui  /  npm run ui  → opens deliverable dashboard
```

## Adversarial self-review (Pass B)

1. **Finding:** WER chart uses baked numbers if live qa-report.json missing.  
   **Resolution:** app.js prefers demo-output when served from same origin; static fallback.

2. **Finding:** Karaoke demo audio may 404 if demo-output gitignored.  
   **Resolution:** Embed relative path; generate via demos; graceful empty.

3. **Finding:** Matrix not pulled from COMPETITIVE_ANALYSIS.md automatically.  
   **Resolution:** Hand-synced for G27; acceptable.

## Self-review Pass A

Skip link, keyboard nav, aria labels on charts/tables.
