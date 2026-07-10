#!/usr/bin/env python3
"""Offline transcription via faster-whisper. Emits JSON on stdout."""
from __future__ import annotations

import argparse
import json
import sys
import time


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("--model", default="tiny", choices=["tiny", "base", "small", "medium"])
    p.add_argument("--language", default="en")
    p.add_argument("--device", default="cpu")
    p.add_argument("--compute-type", default="int8")
    p.add_argument("--model-dir", default="")
    p.add_argument("--word-timestamps", action="store_true", default=True)
    p.add_argument("--no-word-timestamps", action="store_true")
    args = p.parse_args()
    word_ts = not args.no_word_timestamps

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        print(json.dumps({"error": f"faster_whisper not installed: {e}"}))
        return 2

    t0 = time.time()
    model_kwargs = {
        "device": args.device,
        "compute_type": args.compute_type,
    }
    if args.model_dir:
        model_kwargs["download_root"] = args.model_dir

    model = WhisperModel(args.model, **model_kwargs)
    segments_iter, info = model.transcribe(
        args.audio,
        language=args.language if args.language and args.language != "auto" else None,
        word_timestamps=word_ts,
        vad_filter=True,
    )

    segments = []
    full_parts = []
    for seg in segments_iter:
        words = []
        if word_ts and seg.words:
            for w in seg.words:
                words.append(
                    {
                        "word": (w.word or "").strip(),
                        "startMs": int(round((w.start or 0) * 1000)),
                        "endMs": int(round((w.end or 0) * 1000)),
                    }
                )
        text = (seg.text or "").strip()
        full_parts.append(text)
        segments.append(
            {
                "text": text,
                "startMs": int(round((seg.start or 0) * 1000)),
                "endMs": int(round((seg.end or 0) * 1000)),
                "words": words,
            }
        )

    duration_ms = int(round((info.duration or 0) * 1000))
    out = {
        "text": " ".join(full_parts).strip(),
        "segments": segments,
        "language": getattr(info, "language", args.language) or args.language or "en",
        "durationMs": duration_ms,
        "model": args.model,
        "elapsedMs": int(round((time.time() - t0) * 1000)),
    }
    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
