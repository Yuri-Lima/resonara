#!/usr/bin/env python3
"""CLI wrapper for faster-whisper — emits one JSON line on stdout."""
from __future__ import annotations

import argparse
import json
import sys
import time


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("--model", default="tiny")
    p.add_argument("--language", default="en")
    p.add_argument("--device", default="cpu")
    p.add_argument("--compute-type", default="int8")
    p.add_argument("--model-dir", default=None)
    p.add_argument("--no-word-timestamps", action="store_true")
    args = p.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        print(json.dumps({"error": f"faster-whisper not installed: {e}"}))
        return 1

    t0 = time.time()
    try:
        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute_type,
            download_root=args.model_dir,
        )
        segments_iter, info = model.transcribe(
            args.audio,
            language=args.language or None,
            word_timestamps=not args.no_word_timestamps,
            vad_filter=False,
        )
        segments = []
        text_parts = []
        for seg in segments_iter:
            words = []
            if seg.words:
                for w in seg.words:
                    words.append(
                        {
                            "word": (w.word or "").strip(),
                            "startMs": int(round(float(w.start) * 1000)),
                            "endMs": int(round(float(w.end) * 1000)),
                        }
                    )
            piece = (seg.text or "").strip()
            text_parts.append(piece)
            segments.append(
                {
                    "text": piece,
                    "startMs": int(round(float(seg.start) * 1000)),
                    "endMs": int(round(float(seg.end) * 1000)),
                    "words": words,
                }
            )
        text = " ".join(t for t in text_parts if t).strip()
        out = {
            "text": text,
            "segments": segments,
            "language": getattr(info, "language", args.language) or "en",
            "durationMs": int(round(float(getattr(info, "duration", 0) or 0) * 1000)),
            "model": args.model,
            "elapsedMs": int(round((time.time() - t0) * 1000)),
        }
        print(json.dumps(out, ensure_ascii=False))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
