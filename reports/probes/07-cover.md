# Probe: Cover art

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:09.179Z

## Evidence

```
synth ok=true id=a311c572-a39e-404c-b8aa-67edb8cd0709 format=mp3

cover → 200 bytes=997

audio bytes=74348

ffprobe:
{
    "streams": [
        {
            "index": 0,
            "codec_name": "mp3",
            "codec_long_name": "MP3 (MPEG audio layer 3)",
            "codec_type": "audio",
            "codec_tag_string": "[0][0][0][0]",
            "codec_tag": "0x0000",
            "sample_fmt": "fltp",
            "sample_rate": "48000",
            "channels": 1,
            "channel_layout": "mono",
            "bits_per_sample": 0,
            "initial_padding": 0,
            "r_frame_rate": "0/0",
            "avg_frame_rate": "0/0",
            "time_base": "1/14112000",
            "start_pts": 324870,
            "start_time": "0.023021",
            "duration_ts": 43352064,
            "duration": "3.072000",
            "bit_rate": "192000",
            "disposition": {
                "default": 0,
                "dub": 0,
                "original": 0,
                "comment": 0,
                "lyrics": 0,
                "karaoke": 0,
                "forced": 0,
                "hearing_impaired": 0,
                "visual_impaired": 0,
                "clean_effects": 0,
                "attached_pic": 0,
                "timed_thumbnails": 0,
                "non_diegetic": 0,
                "captions": 0,
                "descriptions": 0,
                "metadata": 0,
                "dependent": 0,
                "still_image": 0,
                "multilayer": 0
            }
        }
    ],
    "format": {
        "filename": "/private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/cover-probe.mp3",
        "nb_streams": 1,
        "nb_programs": 0,
        "nb_stream_groups": 0,
        "format_name": "mp3",
        "format_long_name": "MP2/3 (MPEG audio layer 2/3)",
        "start_time": "0.023021",
        "duration": "3.072000",
        "size": "74348",
        "bit_rate": "193614",
        "probe_score": 51,
        "tags": {
            "encoder": "Lavf61.7.100"
        }
    }
}

```

## Gaps

- (none)

## Structured

```json
{
  "feature": "Cover art",
  "verdict": "WORKING",
  "gaps": [],
  "fixEstimate": "S"
}
```
