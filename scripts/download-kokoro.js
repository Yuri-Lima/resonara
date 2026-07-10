#!/usr/bin/env node
/**
 * Install kokoro-onnx into tools/kokoro-venv and download model+voices if possible.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const VENV = path.join(ROOT, 'tools', 'kokoro-venv');
const MODEL_DIR = path.join(ROOT, 'tools', 'kokoro', 'models');
const SCRIPT = path.join(ROOT, 'tools', 'kokoro', 'synthesize.py');

function py() {
  return path.join(VENV, 'bin', 'python');
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
      console.log('cached', dest);
      return resolve();
    }
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, { headers: { 'User-Agent': 'resonara-kokoro' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', reject);
  });
}

function main() {
  fs.mkdirSync(path.dirname(VENV), { recursive: true });
  if (!fs.existsSync(py())) {
    console.log('Creating kokoro venv…');
    execSync(`python3 -m venv "${VENV}"`, { stdio: 'inherit' });
  }
  console.log('Installing kokoro-onnx + soundfile…');
  execSync(`"${py()}" -m pip install -U pip -q`, { stdio: 'inherit' });
  try {
    execSync(`"${py()}" -m pip install -U kokoro-onnx soundfile numpy -q`, {
      stdio: 'inherit',
    });
  } catch (e) {
    console.warn('kokoro-onnx pip install failed:', e.message);
  }
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(SCRIPT), { recursive: true });
  // Write synthesize helper
  fs.writeFileSync(
    SCRIPT,
    `#!/usr/bin/env python3
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
`,
    'utf8',
  );
  fs.chmodSync(SCRIPT, 0o755);

  // Try known model URLs (thewh1teagle releases / HF)
  const urls = [
    {
      url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
      dest: path.join(MODEL_DIR, 'kokoro-v1.0.onnx'),
    },
    {
      url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
      dest: path.join(MODEL_DIR, 'voices-v1.0.bin'),
    },
  ];
  (async () => {
    for (const u of urls) {
      try {
        console.log('Downloading', u.url);
        await download(u.url, u.dest);
      } catch (e) {
        console.warn('download failed', u.url, e.message);
      }
    }
    console.log('Kokoro setup done. models:', MODEL_DIR);
  })();
}

main();
