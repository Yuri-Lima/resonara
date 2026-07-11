# Phase 3 — FIX MARATHON II: PARTIAL → WORKING

**Status:** COMPLETE

| Feature | Before | After | Evidence |
|---------|--------|-------|----------|
| EPUB export | PARTIAL (overlay dir only) | WORKING | book.epub zip with mimetype, META-INF/container.xml, OEBPS/* |
| Preprocessor | PARTIAL (Page N of M kept) | WORKING | cleaned="Hello world." removals pageNumbers |
| CLI | PARTIAL (auto-start hides server-down) | WORKING | `--no-start` → exit 1 + clear message on :19998 |
| Watch debounce | expected gap | improved | settle timer before enqueue |

## Runtime re-probe (pasted)

### Preprocessor
```
cleaned: "Hello world."
removals: Page 1 of 99, Page 2 of 99 (rule=pageNumbers)
```

### CLI
```
Resonara server not reachable on :19998 (connect ECONNREFUSED ...)
exit=1
```

### EPUB
```
epubPath=.../book.epub
unzip: mimetype, META-INF/container.xml, OEBPS/chapter.smil, chapter.xhtml, content.opf, speech.wav
```

## Review Loop v2

- BUILD clean, TEST 222 pass (+2 pinning tests)
- SELF-REVIEW B: adm-zip untyped (mirrors document-extractor); mimetype compression best-effort; CLI still auto-starts by default (opt-in --no-start)
- Commit: fix(v2): phase 3 partial features to WORKING
