#!/usr/bin/env node
/**
 * Prosody metrics harness for Resonara expressive evaluation.
 *
 * Metrics (per file and optionally per sentence via energy-based segmentation):
 *   - F0 mean / range / variance (Hz) via librosa.pyin
 *   - speech rate proxy (voiced frames / duration)
 *   - energy mean / variance (RMS)
 *   - prosodic diversity score (cross-sentence F0 variance of means — anti-metronome)
 *
 * Unit test mode: --self-test generates synthetic tones and checks known pitch ±5%.
 *
 * Usage:
 *   node scripts/prosody-metrics.js <audio.wav> [...]
 *   node scripts/prosody-metrics.js --dir bench/baseline
 *   node scripts/prosody-metrics.js --self-test
 *   node scripts/prosody-metrics.js --json out.json <audio.wav>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const VENV_PY =
  process.env.PROSODY_PYTHON ||
  path.join(ROOT, 'tools', 'prosody-venv', 'bin', 'python');

const METRIC_SCRIPT = `
import sys, json, math
import numpy as np

def analyze(path, fmin=65.0, fmax=400.0):
    import librosa
    y, sr = librosa.load(path, sr=None, mono=True)
    duration = float(len(y) / sr) if sr else 0.0
    if duration < 0.05:
        return {"path": path, "error": "too_short", "durationSec": duration}

    # F0 via pyin
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y, fmin=fmin, fmax=fmax, sr=sr, frame_length=2048
    )
    f0_v = f0[~np.isnan(f0)] if f0 is not None else np.array([])
    if f0_v.size == 0:
        f0_mean = f0_range = f0_var = f0_std = None
    else:
        f0_mean = float(np.mean(f0_v))
        f0_range = float(np.max(f0_v) - np.min(f0_v))
        f0_var = float(np.var(f0_v))
        f0_std = float(np.std(f0_v))

    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    energy_mean = float(np.mean(rms))
    energy_var = float(np.var(rms))
    energy_std = float(np.std(rms))

    hop = 512
    n_frames = 1 + max(0, (len(y) - 2048) // hop) if len(y) >= 2048 else max(1, len(rms))
    voiced_frac = float(np.mean(~np.isnan(f0))) if f0 is not None and len(f0) else 0.0
    # speech-rate proxy: voiced frames per second
    speech_rate_proxy = float(voiced_frac * (sr / hop)) if sr else 0.0

    # Sentence-like segments via silence gaps in RMS
    thr = max(energy_mean * 0.35, 1e-5)
    active = rms > thr
    segments = []
    in_seg = False
    start = 0
    for i, a in enumerate(active):
        if a and not in_seg:
            in_seg = True
            start = i
        elif not a and in_seg:
            in_seg = False
            if i - start >= 4:
                segments.append((start, i))
    if in_seg and len(active) - start >= 4:
        segments.append((start, len(active)))

    # Map frame indices to f0 frames (pyin hop typically 512 too)
    sent_f0_means = []
    sent_rates = []
    for s, e in segments[:40]:
        # approximate f0 slice
        if f0 is None or len(f0) == 0:
            continue
        fs = min(s, len(f0) - 1)
        fe = min(e, len(f0))
        chunk = f0[fs:fe]
        chunk_v = chunk[~np.isnan(chunk)]
        if chunk_v.size >= 3:
            sent_f0_means.append(float(np.mean(chunk_v)))
            sent_rates.append(float(np.mean(~np.isnan(chunk))))

    if len(sent_f0_means) >= 2:
        prosodic_diversity = float(np.var(sent_f0_means))
        speech_rate_variance = float(np.var(sent_rates)) if len(sent_rates) >= 2 else 0.0
    else:
        # fallback: use F0 std as diversity proxy for short clips
        prosodic_diversity = f0_var if f0_var is not None else 0.0
        speech_rate_variance = 0.0

    return {
        "path": path,
        "durationSec": round(duration, 3),
        "sampleRate": int(sr),
        "f0MeanHz": None if f0_mean is None else round(f0_mean, 2),
        "f0RangeHz": None if f0_range is None else round(f0_range, 2),
        "f0Variance": None if f0_var is None else round(f0_var, 2),
        "f0StdHz": None if f0_std is None else round(f0_std, 2),
        "energyMean": round(energy_mean, 6),
        "energyVariance": round(energy_var, 8),
        "energyStd": round(energy_std, 6),
        "voicedFraction": round(voiced_frac, 4),
        "speechRateProxy": round(speech_rate_proxy, 2),
        "segmentCount": len(segments),
        "prosodicDiversity": round(prosodic_diversity, 2),
        "speechRateVariance": round(speech_rate_variance, 6),
        "sentenceF0Means": [round(x, 2) for x in sent_f0_means[:20]],
    }

def self_test():
    import soundfile as sf
    import tempfile, os
    sr = 22050
    results = []
    for hz in (120.0, 220.0, 330.0):
        t = np.linspace(0, 1.0, sr, endpoint=False)
        y = 0.3 * np.sin(2 * np.pi * hz * t).astype(np.float32)
        # mild amplitude envelope so RMS segmentation works
        env = np.linspace(0.5, 1.0, len(y))
        y = y * env
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        sf.write(path, y, sr)
        try:
            m = analyze(path, fmin=max(50.0, hz * 0.5), fmax=min(800.0, hz * 2.5))
            m["expectedHz"] = hz
            if m.get("f0MeanHz") is None:
                m["pass"] = False
                m["deltaPct"] = None
            else:
                delta = abs(m["f0MeanHz"] - hz) / hz * 100.0
                m["deltaPct"] = round(delta, 2)
                m["pass"] = delta <= 5.0
            results.append(m)
        finally:
            try: os.unlink(path)
            except: pass
    ok = all(r.get("pass") for r in results)
    return {"selfTest": True, "pass": ok, "tones": results}

def main():
    args = sys.argv[1:]
    if args and args[0] == "--self-test":
        print(json.dumps(self_test(), indent=2))
        return
    out = []
    for p in args:
        try:
            out.append(analyze(p))
        except Exception as e:
            out.append({"path": p, "error": str(e)})
    print(json.dumps(out if len(out) != 1 else out[0], indent=2))

if __name__ == "__main__":
    main()
`;

function findPython() {
  if (fs.existsSync(VENV_PY)) return VENV_PY;
  // fallback
  for (const c of ['python3', 'python']) {
    const r = spawnSync(c, ['-c', 'import librosa'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}

function runMetrics(audioPaths, { selfTest = false } = {}) {
  const py = findPython();
  if (!py) {
    throw new Error(
      'Prosody Python not found. Create tools/prosody-venv and pip install librosa numpy soundfile scipy',
    );
  }
  const scriptPath = path.join(os.tmpdir(), `resonara-prosody-${process.pid}.py`);
  fs.writeFileSync(scriptPath, METRIC_SCRIPT, 'utf8');
  const args = selfTest ? [scriptPath, '--self-test'] : [scriptPath, ...audioPaths];
  const r = spawnSync(py, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });
  try {
    fs.unlinkSync(scriptPath);
  } catch {
    /* */
  }
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').slice(0, 2000);
    throw new Error(`prosody-metrics failed (exit ${r.status}): ${err}`);
  }
  return JSON.parse(r.stdout);
}

function collectWavs(dir) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(wav|aiff|flac|mp3)$/i.test(name)) out.push(p);
    }
  }
  walk(dir);
  return out.sort();
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(`Usage:
  node scripts/prosody-metrics.js --self-test
  node scripts/prosody-metrics.js <audio.wav> [...]
  node scripts/prosody-metrics.js --dir <folder>
  node scripts/prosody-metrics.js --json out.json <audio...>

Metrics: F0 mean/range/variance, energy, speech-rate proxy, prosodic diversity.
Self-test: synthetic tones at 120/220/330 Hz must recover mean F0 within ±5%.`);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  let jsonOut = null;
  const files = [];
  let selfTest = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--self-test') selfTest = true;
    else if (argv[i] === '--json') jsonOut = argv[++i];
    else if (argv[i] === '--dir') {
      files.push(...collectWavs(argv[++i]));
    } else if (!argv[i].startsWith('-')) {
      files.push(argv[i]);
    }
  }

  let result;
  if (selfTest) {
    result = runMetrics([], { selfTest: true });
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) {
      console.error('SELF-TEST FAILED: F0 recovery outside ±5%');
      process.exit(1);
    }
    console.error('SELF-TEST PASS');
  } else {
    if (!files.length) {
      console.error('No audio files');
      process.exit(1);
    }
    result = runMetrics(files);
    console.log(JSON.stringify(result, null, 2));
  }

  if (jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(jsonOut)) || '.', { recursive: true });
    fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));
    console.error('Wrote', jsonOut);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

module.exports = { runMetrics, collectWavs, findPython };
