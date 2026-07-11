# Probe: Podcast feeds

**Verdict:** PARTIAL  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:15:42.945Z

## Evidence

```
POST /tts/synthesize → 201
{
  "id": "4ac04e51-4724-4aec-89ef-eaba1e41fc21",
  "status": "queued",
  "progress": 0,
  "wordCount": 13,
  "chunkCount": 0,
  "chunksDone": 0,
  "voice": "kokoro:af_sarah",
  "engine": "kokoro",
  "format": "wav",
  "outputPath": null,
  "error": null,
  "metadata": {
    "wordCount": 13,
    "title": "Feed Probe Episode",
    "dialogue": false,
    "postProcess": {
      "normalize": true,
      "highpass": true,
      "compress": false,
      "preset": "podcast"
    },
    "language": "en"
  },
  "createdAt": "2026-07-11T22:15:38.000Z",
  "completedAt": null
}

synth wait id=4ac04e51-4724-4aec-89ef-eaba1e41fc21 status=completed duration=6.784042

GET /feeds → 200 count=100 includesJob=false
(take: 100 hard cap; newest synth job not present in list)

feeds sample:
[
  {
    "jobId": "23a86a4b-ce08-45d8-8595-b8f080c2214f",
    "title": "23a86a4b-ce08-45d8-8595-b8f080c2214f",
    "url": "/feeds/23a86a4b-ce08-45d8-8595-b8f080c2214f/rss.xml"
  },
  {
    "jobId": "7214a62b-0517-410b-8198-e418c0291a79",
    "title": "7214a62b-0517-410b-8198-e418c0291a79",
    "url": "/feeds/7214a62b-0517-410b-8198-e418c0291a79/rss.xml"
  }
]

GET /feeds/4ac04e51-4724-4aec-89ef-eaba1e41fc21/rss.xml → 200 content-type=application/rss+xml; charset=utf-8

RSS XML:
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Feed Probe Episode</title>
    <description>Podcast feed probe episode about offline audio distribution for Resonara LAN podcast apps.</description>
    <link>http://127.0.0.1:3847/ui/voice/</link>
    <language>en</language>
    <itunes:author>Resonara</itunes:author>
    <itunes:summary>Podcast feed probe episode about offline audio distribution for Resonara LAN podcast apps.</itunes:summary>
    <itunes:image href="http://127.0.0.1:3847/tts/jobs/4ac04e51-4724-4aec-89ef-eaba1e41fc21/cover"/>
    <image>...</image>
    <item>
      <title>Feed Probe Episode</title>
      <description>Feed Probe Episode</description>
      <guid isPermaLink="false">4ac04e51-4724-4aec-89ef-eaba1e41fc21-full</guid>
      <pubDate>Sat, 11 Jul 2026 22:15:42 GMT</pubDate>
      <enclosure url="http://127.0.0.1:3847/tts/jobs/4ac04e51-4724-4aec-89ef-eaba1e41fc21/download" type="audio/mpeg" length="977004"/>
      <itunes:duration>00:00:07</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>
  </channel>
</rss>

checks: hasChannel=true hasEnclosure=true itunes=true guid=true

enclosure absolute GET http://127.0.0.1:3847/.../download → 404 size=105
enclosure path GET on :3848 /tts/jobs/.../download → 200 bytes=977004 content-type=audio/wav

NOTE: RESONARA_PUBLIC_URL defaults to http://127.0.0.1:3847 while this probe server is :3848.
NOTE: enclosure @type="audio/mpeg" but download serves audio/wav (format=wav job).
```

## Gaps

- Absolute enclosure URL uses default RESONARA_PUBLIC_URL port 3847 → HTTP 404; path on actual server :3848 → 200 (podcast apps that follow absolute enclosure URLs will fail without correct PUBLIC_URL)
- Enclosure MIME type claims audio/mpeg while body is audio/wav
- GET /feeds hard-capped at take=100 with no order/pagination — completed probe job omitted from list

## Structured

```json
{
  "feature": "Podcast feeds",
  "verdict": "PARTIAL",
  "gaps": [
    "Absolute enclosure URL uses default RESONARA_PUBLIC_URL port 3847 → HTTP 404; path on actual server :3848 → 200",
    "Enclosure MIME type claims audio/mpeg while body is audio/wav",
    "GET /feeds hard-capped at take=100 with no order/pagination — completed probe job omitted from list"
  ],
  "fixEstimate": "S"
}
```
