# Phase 6 — UX polish + accessibility

**Status:** COMPLETE

## Delivered

- Keyboard map (`?` overlay): `/` text, `n` new, `l` library, `s` settings, `Esc` close
- Focus-visible styles; dark theme contrast targeting WCAG AA
- `aria-live` toast host for job completion announcements
- Settings consolidation: engine, language, feeds, pause profile, diagnostics export
- Manual walkthrough notes below

## Click-path notes

1. Open Voice → onboarding → dismiss  
2. `l` stays on library; `n` opens wizard  
3. Paste paragraph → synthesize → toast on complete  
4. Settings → export diagnostics → status message  
5. `?` → help dialog → Esc  

## Review Loop v2

Static UI; no new failing unit tests. Contrast tokens: `--text #e8eaed` on `--bg #0e1116`.
