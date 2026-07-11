# Probe: EPUB export

**Verdict:** PARTIAL  
**Fix estimate:** M  
**Timestamp:** 2026-07-11T22:16:13.389Z

## Evidence

```
synth ok=true id=8b5e6b71-df16-4632-aef0-6d5a938424d0

POST export/epub-overlay → 201
{
  "outDir": "/Users/yurilima/.resonara/data/8b5e6b71-df16-4632-aef0-6d5a938424d0/epub-overlay",
  "smilPath": "/Users/yurilima/.resonara/data/8b5e6b71-df16-4632-aef0-6d5a938424d0/epub-overlay/chapter.smil",
  "xhtmlPath": "/Users/yurilima/.resonara/data/8b5e6b71-df16-4632-aef0-6d5a938424d0/epub-overlay/chapter.xhtml",
  "opfPath": "/Users/yurilima/.resonara/data/8b5e6b71-df16-4632-aef0-6d5a938424d0/epub-overlay/content.opf",
  "sentenceCount": 2,
  "method": "cached"
}

unzip:
Archive:  /private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/probe.epub
  End-of-central-directory signature not found.  Either this file is not
  a zipfile, or it constitutes one disk of a multi-part archive.  In the
  latter case the central directory and zipfile comment will be found on
  the last disk(s) of this archive.
unzip:  cannot find zipfile directory in one of /private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/probe.epub or
        /private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/probe.epub.zip, and cannot find /private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/probe.epub.ZIP, period.

```

## Gaps

- Response bytes but not valid epub zip

## Structured

```json
{
  "feature": "EPUB export",
  "verdict": "PARTIAL",
  "gaps": [
    "Response bytes but not valid epub zip"
  ],
  "fixEstimate": "M"
}
```
