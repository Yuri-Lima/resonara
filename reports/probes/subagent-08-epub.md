# Probe: EPUB export (Media Overlays)

**Verdict:** PARTIAL  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:15:20.000Z  
**Server:** http://127.0.0.1:3848  
**Job id:** `8af3c026-8753-4842-9698-c6044d82643e`

## Goal

Prove EPUB export from a completed TTS job yields a **structurally valid EPUB container** (OCF): `mimetype`, `META-INF/container.xml`, and `content.opf`.

## Steps

1. `POST /tts/synthesize` — short EN job, `qa: off`, title `EPUB Probe Book`
2. Poll `GET /tts/jobs/:id` → `completed`
3. `POST /tts/jobs/:id/export/epub-overlay`
4. Inspect returned package directory; zip for `unzip -l`; check required OCF members

## Evidence

### 1. Synthesize

```
POST /tts/synthesize → 201/200
{
  "id": "8af3c026-8753-4842-9698-c6044d82643e",
  "status": "queued",
  "wordCount": 13,
  "voice": "kokoro:af_sarah",
  "engine": "kokoro",
  "format": "wav",
  "metadata": { "title": "EPUB Probe Book", "language": "en" }
}
```

Poll → `completed` (~7s), audio at  
`/Users/yurilima/.resonara/data/8af3c026-8753-4842-9698-c6044d82643e/speech.wav`

### 2. Export

```
POST /tts/jobs/8af3c026-8753-4842-9698-c6044d82643e/export/epub-overlay → 201
{
  "outDir": "/Users/yurilima/.resonara/data/8af3c026-8753-4842-9698-c6044d82643e/epub-overlay",
  "smilPath": ".../epub-overlay/chapter.smil",
  "xhtmlPath": ".../epub-overlay/chapter.xhtml",
  "opfPath": ".../epub-overlay/content.opf",
  "sentenceCount": 2,
  "method": "cached"
}
```

**No `.epub` file is returned or written.** Only a flat overlay directory.

### 3. Package directory listing

```
epub-overlay/
  chapter.smil
  chapter.xhtml
  content.opf
  speech.wav
```

### 4. Required OCF / EPUB checks

| Artifact | Present? |
|---|---|
| `mimetype` (`application/epub+zip`) | **MISSING** |
| `META-INF/container.xml` | **MISSING** |
| `content.opf` | YES |
| SMIL media overlay (`chapter.smil`) | YES |
| XHTML chapter with sentence spans | YES |
| Audio asset | YES (`speech.wav`) |
| Packaged `.epub` (ZIP/OCF) | **MISSING** (API returns paths only) |

### 5. `unzip -l` (directory zipped post-hoc for inspection)

Probe zipped `outDir` → `reports/probes/fixtures/epub-probe.epub` solely for listing:

```
Archive:  reports/probes/fixtures/epub-probe.epub
  Length      Date    Time    Name
---------  ---------- -----   ----
      320  07-12-2026 00:15   chapter.xhtml
      735  07-12-2026 00:15   content.opf
   664830  07-12-2026 00:15   speech.wav
      511  07-12-2026 00:15   chapter.smil
---------                     -------
   666396                     4 files
```

First ZIP entry is `chapter.xhtml` (not uncompressed `mimetype`). No `META-INF/container.xml`.

### 6. `content.opf` (excerpt)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">10425551-31e4-4e3f-b147-b92538e5ba48</dc:identifier>
    <dc:title>EPUB Probe Book</dc:title>
    <dc:language>en</dc:language>
    <meta property="media:duration">00:00:04.616</meta>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="audio" href="speech.wav" media-type="audio/mpeg"/>
    <item id="mo-ch1" href="chapter.smil" media-type="application/smil+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/ media-overlay="mo-ch1">
  </spine>
</package>
```

Issues inside OPF:

1. **Malformed spine itemref** — self-closing slash left before attribute:  
   `<itemref idref="ch1"/ media-overlay="mo-ch1">`  
   (bug in `injectOpfMediaOverlays` regex: `[^>]*` eats `/`, then `(/>|>)` matches trailing `>`).
2. **Wrong audio media-type** — `speech.wav` declared as `audio/mpeg`.

### 7. SMIL / XHTML (working pieces)

`chapter.smil` has monotonic clips for 2 sentences (`0.000–0.757s`, `0.757–4.616s`).  
`chapter.xhtml` wraps text in `#s0001` / `#s0002` spans correctly.

## Gaps

1. No OCF `mimetype` file (`application/epub+zip`).
2. No `META-INF/container.xml` pointing at the OPF rootfile.
3. No packaged `.epub` ZIP produced or downloadable from the API (directory of loose files only).
4. `content.opf` spine `itemref` is invalid XML after media-overlay injection.
5. Audio item media-type hard-coded as `audio/mpeg` even when format is WAV.

## Root cause (code)

- `src/tts/export/epub-overlay-exporter.ts` → `writeOverlayPackage` writes only XHTML + SMIL + OPF (no mimetype, no container.xml, no ZIP).
- `src/tts/tts.service.ts` → `exportEpubOverlay` returns path metadata; does not assemble an EPUB container.
- `injectOpfMediaOverlays` regex corrupts self-closing `<itemref .../>`.

## Fix sketch (S)

1. Fix spine injection: rewrite `itemref` as  
   `<itemref idref="ch1" media-overlay="mo-ch1"/>`.
2. Emit `mimetype` + `META-INF/container.xml`.
3. Set audio media-type from extension (`audio/wav` vs `audio/mpeg`).
4. Zip OCF correctly (store `mimetype` first, uncompressed) → `book.epub`; return path or stream.

## Structured

```json
{
  "feature": "EPUB export (epub-overlay)",
  "verdict": "PARTIAL",
  "gaps": [
    "missing mimetype (application/epub+zip)",
    "missing META-INF/container.xml",
    "no .epub ZIP package — loose overlay directory only",
    "malformed content.opf spine itemref after media-overlay inject",
    "audio media-type audio/mpeg for speech.wav"
  ],
  "fixEstimate": "S"
}
```
