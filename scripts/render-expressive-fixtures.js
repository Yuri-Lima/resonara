#!/usr/bin/env node
/**
 * Render samples/expressive/* with Piper, Kokoro, platform, or expressive engines.
 * Usage:
 *   node scripts/render-expressive-fixtures.js --engine piper --out bench/baseline/piper
 *   node scripts/render-expressive-fixtures.js --engine platform --out bench/baseline/platform
 *   node scripts/render-expressive-fixtures.js --engine all --out bench/baseline
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function listFixtures() {
  const base = path.join(ROOT, 'samples', 'expressive');
  const files = [];
  function walk(d, rel = '') {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p, path.join(rel, name));
      else if (name.endsWith('.txt')) files.push({ rel: path.join(rel, name), abs: p });
    }
  }
  walk(base);
  return files;
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function synthPlatform(text, outWav) {
  const aiff = outWav.replace(/\.wav$/i, '.aiff');
  const r = spawnSync('say', ['-o', aiff, text], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`say failed: ${r.stderr || r.stdout}`);
  const c = spawnSync(
    'ffmpeg',
    ['-y', '-i', aiff, '-ar', '22050', '-ac', '1', outWav],
    { encoding: 'utf8' },
  );
  try {
    fs.unlinkSync(aiff);
  } catch {
    /* */
  }
  if (c.status !== 0) throw new Error(`ffmpeg failed: ${c.stderr}`);
}

function synthPiper(text, outWav, modelPath, piperBin) {
  const r = spawnSync(
    piperBin,
    ['--model', modelPath, '--out_file', outWav],
    { input: text, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error(`piper failed: ${(r.stderr || r.stdout || '').slice(0, 500)}`);
  }
}

function findPiper() {
  const cands = [
    path.join(ROOT, 'tools', 'piper-venv', 'bin', 'piper'),
    path.join(ROOT, 'resources', 'piper', 'piper'),
    '/opt/homebrew/bin/piper',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  // python -m piper
  const py = path.join(ROOT, 'tools', 'piper-venv', 'bin', 'python');
  if (fs.existsSync(py)) {
    return { type: 'python', bin: py };
  }
  return null;
}

function findPiperModel(lang = 'en') {
  const modelsDir =
    process.env.PIPER_MODELS_DIR || path.join(ROOT, 'resources', 'piper', 'models');
  const preferred =
    lang === 'pt'
      ? 'pt_BR-faber-medium.onnx'
      : 'en_US-lessac-medium.onnx';
  const p = path.join(modelsDir, preferred);
  if (fs.existsSync(p)) return p;
  if (!fs.existsSync(modelsDir)) return null;
  const any = fs.readdirSync(modelsDir).find((f) => f.endsWith('.onnx'));
  return any ? path.join(modelsDir, any) : null;
}

function synthKokoro(text, outWav, voice = 'af_sarah') {
  const py =
    process.env.KOKORO_PYTHON ||
    path.join(ROOT, 'tools', 'kokoro-venv', 'bin', 'python');
  const synthPy = path.join(ROOT, 'tools', 'kokoro', 'synthesize.py');
  if (!fs.existsSync(py) || !fs.existsSync(synthPy)) {
    throw new Error('Kokoro not installed');
  }
  const r = spawnSync(
    py,
    [synthPy, '--text', text, '--voice', voice, '--out', outWav],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error(`kokoro failed: ${(r.stderr || r.stdout || '').slice(0, 800)}`);
  }
}

function synthExpressive(text, outWav, opts = {}) {
  const py =
    process.env.EXPRESSIVE_PYTHON ||
    path.join(ROOT, 'tools', 'expressive-venv', 'bin', 'python');
  const synthPy = path.join(ROOT, 'tools', 'expressive', 'synthesize.py');
  if (!fs.existsSync(py) || !fs.existsSync(synthPy)) {
    throw new Error('Expressive engine not installed');
  }
  const args = [synthPy, '--text', text, '--out', outWav];
  if (opts.exaggeration != null) args.push('--exaggeration', String(opts.exaggeration));
  if (opts.emotion) args.push('--emotion', opts.emotion);
  if (opts.refAudio) args.push('--ref', opts.refAudio);
  const r = spawnSync(py, args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env },
  });
  if (r.status !== 0) {
    throw new Error(`expressive failed: ${(r.stderr || r.stdout || '').slice(0, 1200)}`);
  }
}

function renderOne(engine, fixture, outDir) {
  const text = fs.readFileSync(fixture.abs, 'utf8').trim();
  const stem = fixture.rel.replace(/\.txt$/, '').replace(/[\\/]/g, '__');
  const outWav = path.join(outDir, `${stem}.wav`);
  ensureDir(outDir);
  const t0 = Date.now();
  const isPt = /pt-br|pt_br/i.test(fixture.rel);

  if (engine === 'platform') {
    synthPlatform(text, outWav);
  } else if (engine === 'piper') {
    const bin = findPiper();
    const model = findPiperModel(isPt ? 'pt' : 'en');
    if (!bin || !model) throw new Error('Piper binary or model missing');
    if (typeof bin === 'object') {
      const r = spawnSync(
        bin.bin,
        ['-m', 'piper', '--model', model, '--out_file', outWav],
        { input: text, encoding: 'utf8' },
      );
      if (r.status !== 0) throw new Error(`piper-py: ${(r.stderr || '').slice(0, 400)}`);
    } else {
      synthPiper(text, outWav, model, bin);
    }
  } else if (engine === 'kokoro') {
    synthKokoro(text, outWav, isPt ? 'pf_dora' : 'af_sarah');
  } else if (engine === 'expressive') {
    synthExpressive(text, outWav);
  } else {
    throw new Error(`Unknown engine ${engine}`);
  }

  const ms = Date.now() - t0;
  const st = fs.statSync(outWav);
  // duration via ffprobe
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outWav],
    { encoding: 'utf8' },
  );
  const dur = parseFloat((probe.stdout || '0').trim()) || 0;
  const rtf = dur > 0 ? ms / 1000 / dur : null;
  return {
    fixture: fixture.rel,
    engine,
    outWav,
    bytes: st.size,
    durationSec: dur,
    wallMs: ms,
    rtf,
  };
}

function main() {
  const argv = process.argv.slice(2);
  let engine = 'platform';
  let outRoot = path.join(ROOT, 'bench', 'baseline');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--engine') engine = argv[++i];
    else if (argv[i] === '--out') outRoot = path.resolve(argv[++i]);
  }
  const engines = engine === 'all' ? ['platform', 'piper', 'kokoro'] : [engine];
  const fixtures = listFixtures();
  const results = [];
  for (const eng of engines) {
    const outDir = engines.length > 1 ? path.join(outRoot, eng) : outRoot;
    console.error(`=== Rendering ${fixtures.length} fixtures with ${eng} → ${outDir}`);
    for (const f of fixtures) {
      try {
        const r = renderOne(eng, f, outDir);
        results.push(r);
        console.error(
          `  OK ${eng}/${f.rel} ${r.durationSec.toFixed(2)}s RTF=${r.rtf != null ? r.rtf.toFixed(2) : '?'}`,
        );
      } catch (e) {
        console.error(`  FAIL ${eng}/${f.rel}: ${e.message}`);
        results.push({ fixture: f.rel, engine: eng, error: e.message });
      }
    }
  }
  const summaryPath = path.join(outRoot, 'render-summary.json');
  ensureDir(outRoot);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ count: results.length, summaryPath, results }, null, 2));
}

if (require.main === module) main();
module.exports = { renderOne, listFixtures, synthPlatform, synthPiper, synthKokoro, synthExpressive };
