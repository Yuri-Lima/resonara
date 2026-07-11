# Probe: Podcast feeds

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:06.127Z

## Evidence

```
synth ok=true id=ff187884-5f89-4a32-bf4a-1950ccc19324

GET /feeds → 200
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
  },
  {
    "jobId": "cdec1f58-4d57-4a26-bacd-e7022f43945a",
    "title": "cdec1f58-4d57-4a26-bacd-e7022f43945a",
    "url": "/feeds/cdec1f58-4d57-4a26-bacd-e7022f43945a/rss.xml"
  },
  {
    "jobId": "58a01084-461e-46d3-90b5-c88528e9374d",
    "title": "58a01084-461e-46d3-90b5-c88528e9374d",
    "url": "/feeds/58a01084-461e-46d3-90b5-c88528e9374d/rss.xml"
  },
  {
    "jobId": "dd70b462-8638-459f-9e09-d398a8f11bbc",
    "title": "dd70b462-8638-459f-9e09-d398a8f11bbc",
    "url": "/feeds/dd70b462-8638-459f-9e09-d398a8f11bbc/rss.xml"
  },
  {
    "jobId": "97e1afc2-ad56-4b05-81c8-f72261748c39",
    "title": "97e1afc2-ad56-4b05-81c8-f72261748c39",
    "url": "/feeds/97e1afc2-ad56-4b05-81c8-f72261748c39/rss.xml"
  },
  {
    "jobId": "aaaaba7e-e003-4ed8-8c86-1241f4f2be0d",
    "title": "aaaaba7e-e003-4ed8-8c86-1241f4f2be0d",
    "url": "/feeds/aaaaba7e-e003-4ed8-8c86-1241f4f2be0d/rss.xml"
  },
  {
    "jobId": "5285b025-5ff4-44fa-80b0-dcd5dafd12ae",
    "title": "5285b025-5ff4-44fa-80b0-dcd5dafd12ae",
    "url": "/feeds/5285b025-5ff4-44fa-80b0-dcd5dafd12ae/rss.xml"
  },
  {
    "jobId": "bb688e95-8bec-4fb4-bfbc-eba0c8859fa6",
    "title": "bb688e95-8bec-4fb4-bfbc-eba0c8859fa6",
    "url": "/feeds/bb688e95-8bec-4fb4-bfbc-eba0c8859fa6/rss.xml"
  },
  {
    "jobId": "24549e92-577c-4568-a6f7-ce435ffd8558",
    "title": "24549e92-577c-4568-a6f7-ce435ffd8558",
    "url": "/feeds/24549e92-577c-4568-a6f7-ce435ffd8558/rss.xml"
  },
  {
    "jobId": "aa524472-5b26-4627-9cb5-7ee594aa400a",
    "title": "aa524472-5b26-4627-9cb5-7ee594aa400a",
    "url": "/feeds/aa524472-5b26-4627-9cb5-7ee594aa400a/rss.xml"
  },
  {
    "jobId": "

GET /feeds/ff187884-5f89-4a32-bf4a-1950ccc19324/rss.xml → 200
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Feed Probe Episode</title>
    <description>Podcast feed probe episode about offline audio distribution.</description>
    <link>http://127.0.0.1:3847/ui/voice/</link>
    <language>en</language>
    <itunes:author>Resonara</itunes:author>
    <itunes:summary>Podcast feed probe episode about offline audio distribution.</itunes:summary>
    <itunes:image href="http://127.0.0.1:3847/tts/jobs/ff187884-5f89-4a32-bf4a-1950ccc19324/cover"/>
    <image><url>http://127.0.0.1:3847/tts/jobs/ff187884-5f89-4a32-bf4a-1950ccc19324/cover</url><title>Feed Probe Episode</title><link>http://127.0.0.1:3847/ui/voice/</link></image>
    <item>
      <title>Feed Probe Episode</title>
      <description>Feed Probe Episode</description>
      <guid isPermaLink="false">ff187884-5f89-4a32-bf4a-1950ccc19324-full</guid>
      <pubDate>Sat, 11 Jul 2026 22:16:06 GMT</pubDate>
      <enclosure url="http://127.0.0.1:3847/tts/jobs/ff187884-5f89-4a32-bf4a-1950ccc19324/download" type="audio/mpeg" length="577644"/>
      <itunes:duration>00:00:04</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>
  </channel>
</rss>


enclosure url=http://127.0.0.1:3847/tts/jobs/ff187884-5f89-4a32-bf4a-1950ccc19324/download

enclosure GET /tts/jobs/ff187884-5f89-4a32-bf4a-1950ccc19324/download → 200 bytes=577644
```

## Gaps

- (none)

## Structured

```json
{
  "feature": "Podcast feeds",
  "verdict": "WORKING",
  "gaps": [],
  "fixEstimate": "S"
}
```
