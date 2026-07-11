# Probe: Text preprocessor

**Verdict:** BROKEN  
**Fix estimate:** M  
**Timestamp:** 2026-07-11T22:16:13.391Z

## Evidence

```
POST preprocess-preview → 201
{
  "original": "Page 1 of 99\n\nCHAPTER ONE\n\nHello   world...  see https://example.com for more.\n\n[1] footnote garbage\n\n\"Smart quotes\" and — dashes.\n\nPage 2 of 99\n",
  "cleaned": "Page 1 of 99\n\nChapter One\n\nHello world… see example dot com for more.\n\nfootnote garbage\n\n\"Smart quotes\" and — dashes.\n\nPage 2 of 99",
  "removals": [
    {
      "rule": "allCapsHeadings",
      "text": "CHAPTER ONE",
      "position": 14
    },
    {
      "rule": "footnotes",
      "text": "[1]",
      "position": 80
    },
    {
      "rule": "urls",
      "text": "https://example.com",
      "position": 49
    }
  ]
}

raw-paste path → 201
{
  "original": "Page 1 of 99\n\nCHAPTER ONE\n\nHello   world...  see https://example.com for more.\n\n[1] footnote garbage\n\n\"Smart quotes\" and — dashes.\n\nPage 2 of 99\n",
  "cleaned": "Page 1 of 99\n\nCHAPTER ONE\n\nHello   world...  see https://example.com for more.\n\n[1] footnote garbage\n\n\"Smart quotes\" and — dashes.\n\nPage 2 of 99\n",
  "removals": []
}

rulesApplied=undefined
```

## Gaps

- preview status 201

## Structured

```json
{
  "feature": "Text preprocessor",
  "verdict": "BROKEN",
  "gaps": [
    "preview status 201"
  ],
  "fixEstimate": "M"
}
```
