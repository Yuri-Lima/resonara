#!/usr/bin/env python3
import argparse, sys
from pathlib import Path

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--text', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--voice', default='af_sarah')
    p.add_argument('--rate', type=float, default=None)
    p.add_argument('--model-dir', default=str(Path(__file__).resolve().parent / 'models'))
    args = p.parse_args()
    try:
        from kokoro_onnx import Kokoro
        import numpy as np
        import soundfile as sf
    except ImportError as e:
        print('kokoro_onnx missing', e, file=sys.stderr)
        return 2
    md = Path(args.model_dir)
    # common filenames from kokoro-onnx releases
    candidates = list(md.glob('*.onnx')) + list(md.glob('**/*.onnx'))
    voices = list(md.glob('*voices*.bin')) + list(md.glob('**/*voices*.bin')) + list(md.glob('**/*.bin'))
    if not candidates:
        print('No Kokoro ONNX model in', md, file=sys.stderr)
        return 3
    model = str(candidates[0])
    voice_file = str(voices[0]) if voices else None
    if voice_file:
        kokoro = Kokoro(model, voice_file)
    else:
        kokoro = Kokoro(model, str(md / 'voices.bin'))
    samples, sample_rate = kokoro.create(args.text, voice=args.voice, speed=1.0 if args.rate is None else max(0.5, min(2.0, args.rate/175 if args.rate>5 else args.rate)))
    sf.write(args.out, samples, sample_rate)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
