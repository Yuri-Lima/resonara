# Probe: Text preprocessor

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:15:40.915Z  
**Server:** http://127.0.0.1:3848  
**Fixture:** `samples/texts/messy-extract.txt`

## What was tested

1. `POST /tts/preprocess-preview` with messy extract + `documentMode: true`
2. Assert page numbers / headers / footnotes / citations / URLs cleaned
3. `documentMode: false` + `enabled: false` — raw paste identity (no cleaning)
4. `enabled: false` alone — same bypass
5. Edge: `"Page N of M"` line form; `documentMode:true` + `enabled:false` precedence

## Results summary

| Check | Result |
|---|---|
| Endpoint reachable | PASS (HTTP 201) |
| Page numbers removed (`14`, `Page 15`, `16`) | PASS |
| Running headers removed (`ACME RESEARCH QUARTERLY` ×4) | PASS |
| Footnotes `[1]`/`[2]` removed | PASS |
| Citations `(Smith et al., 2023)` / `(Jones, 2021)` removed | PASS |
| URL → spoken (`github dot com slash …`) | PASS |
| ALL CAPS headings title-cased | PASS |
| `documentMode:false` + `enabled:false` identity | PASS |
| `enabled:false` alone identity | PASS |
| `"Page N of M"` stripped | FAIL (gap) |
| `enabled:false` overrides `documentMode:true` | FAIL (gap; documentMode wins) |

## Evidence 1 — documentMode true (messy-extract)

```json
{
  "status": 201,
  "removals_count": 14,
  "removal_rules": [
    "allCapsHeadings",
    "citations",
    "footnotes",
    "headers",
    "pageNumbers",
    "urls"
  ],
  "removals": [
    {
      "rule": "headers",
      "text": "ACME RESEARCH QUARTERLY",
      "position": 0
    },
    {
      "rule": "allCapsHeadings",
      "text": "INTRODUCTION TO MARKET DYNAMICS",
      "position": 24
    },
    {
      "rule": "headers",
      "text": "ACME RESEARCH QUARTERLY",
      "position": 213
    },
    {
      "rule": "pageNumbers",
      "text": "14",
      "position": 237
    },
    {
      "rule": "headers",
      "text": "ACME RESEARCH QUARTERLY",
      "position": 398
    },
    {
      "rule": "pageNumbers",
      "text": "Page 15",
      "position": 422
    },
    {
      "rule": "headers",
      "text": "ACME RESEARCH QUARTERLY",
      "position": 596
    },
    {
      "rule": "pageNumbers",
      "text": "16",
      "position": 620
    },
    {
      "rule": "allCapsHeadings",
      "text": "CONCLUSION AND NEXT STEPS",
      "position": 624
    },
    {
      "rule": "footnotes",
      "text": "[1]",
      "position": 104
    },
    {
      "rule": "footnotes",
      "text": "[2]",
      "position": 341
    },
    {
      "rule": "citations",
      "text": "(Smith et al., 2023)",
      "position": 163
    },
    {
      "rule": "citations",
      "text": "(Jones, 2021)",
      "position": 391
    },
    {
      "rule": "urls",
      "text": "https://github.com/acme/market-dynamics",
      "position": 407
    }
  ],
  "cleaned": "Introduction To Market Dynamics\n\nThe modern marketplace evolves faster than traditional models predicted.\nAnalysts note structural shifts across consumer segments .\n\nRetail inventory systems now incorporate predictive signals from social media\nand weather feeds. Early adopters report double-digit gains in fill rates.\n\nFurther methodology notes appear in the appendix . Online\nresources are published at github dot com slash acme slash market dynamics for\nreplication packages.\n\nConclusion And Next Steps\n\nTeams should prioritize clean data pipelines over exotic models. The\nprose must flow without page markers, headers, or citation noise."
}
```

### Cleaned prose (readable)

```
Introduction To Market Dynamics

The modern marketplace evolves faster than traditional models predicted.
Analysts note structural shifts across consumer segments .

Retail inventory systems now incorporate predictive signals from social media
and weather feeds. Early adopters report double-digit gains in fill rates.

Further methodology notes appear in the appendix . Online
resources are published at github dot com slash acme slash market dynamics for
replication packages.

Conclusion And Next Steps

Teams should prioritize clean data pipelines over exotic models. The
prose must flow without page markers, headers, or citation noise.
```

## Evidence 2 — raw-paste bypass (`documentMode:false`, `enabled:false`)

```json
{
  "status": 201,
  "cleaned_equals_original": true,
  "removals_count": 0,
  "preserves_Page_15": true,
  "preserves_footnote": true,
  "preserves_url": true
}
```

Original poison retained (first 280 chars):

```
ACME RESEARCH QUARTERLY
INTRODUCTION TO MARKET DYNAMICS

The modern marketplace evolves faster than traditional models predicted[1].
Analysts note structural shifts across consumer segments (Smith et al., 2023).

ACME RESEARCH QUARTERLY
14

Retail inventory systems now incorporat
```

## Evidence 3 — `enabled:false` alone

```json
{
  "status": 201,
  "cleaned_equals_original": true,
  "removals_count": 0
}
```

## Evidence 4 — edge: Page N of M

```json
{
  "status": 201,
  "cleaned": "Page 1 of 99\nHello world.\nPage 2 of 99",
  "removals": [],
  "still_has_Page_N_of_M": true
}
```

## Evidence 5 — edge: documentMode vs enabled

```json
{
  "status": 201,
  "note": "documentMode=true forces cleaning even when enabled=false",
  "cleaned_equals_original": false,
  "removals_count": 14
}
```

## Gaps

- isPageNumberLine misses "Page N of M" (matches "Page N" and "N of M" separately but not combined)
- previewPreprocess: documentMode=true forces enabled even if enabled=false (enabled cannot turn off document path)
- citation/footnote strip can leave awkward double spaces before punctuation (e.g. "segments .")

## Verdict rationale

Core product path works end-to-end against the real messy fixture and live preview endpoint:
document defaults strip PDF poison; raw paste returns identity with empty `removals`.
Remaining issues are narrow pattern coverage (`Page N of M`) and enabled-flag precedence when
both flags are set — not blockers for the documented document-import vs raw-paste contract.

## Structured

```json
{
  "feature": "Text preprocessor",
  "verdict": "WORKING",
  "gaps": [
    "isPageNumberLine misses \"Page N of M\" (matches \"Page N\" and \"N of M\" separately but not combined)",
    "previewPreprocess: documentMode=true forces enabled even if enabled=false (enabled cannot turn off document path)",
    "citation/footnote strip can leave awkward double spaces before punctuation (e.g. \"segments .\")"
  ],
  "fixEstimate": "S"
}
```
