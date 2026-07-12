#!/usr/bin/env node
/**
 * Build blind eval session manifests + aggregate CMOS from JSONL ledgers.
 *
 *   node scripts/eval-session.js build --seed 42 --out ui/eval-lab/session-manifest.json
 *   node scripts/eval-session.js aggregate --ledger bench/eval/results.jsonl
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildManifest(opts) {
  const seed = opts.seed ?? 42;
  const rand = mulberry32(seed);
  const pairs = opts.pairs || defaultPairs();
  const trials = [];
  let id = 1;

  for (const pair of pairs) {
    const flip = rand() < 0.5;
    const A = flip ? pair.b : pair.a;
    const B = flip ? pair.a : pair.b;
    trials.push({
      id: `t${id++}`,
      fixture: pair.fixture,
      fixtureLabel: pair.label || pair.fixture,
      anchor: pair.anchor || null,
      presentation: {
        A: { system: A.system, url: A.url },
        B: { system: B.system, url: B.url },
      },
      // hidden truth for post-hoc only (UI must not display until end)
      _truth: { aSystem: pair.a.system, bSystem: pair.b.system, flipped: flip },
    });
  }

  // shuffle trial order
  const ordered = shuffle(trials, rand);
  const manifest = {
    sessionId: opts.sessionId || `eval-${seed}-${Date.now()}`,
    seed,
    createdAt: new Date().toISOString(),
    protocol: 'CMOS-blind-v1',
    trials: ordered,
  };
  return manifest;
}

function defaultPairs() {
  const base = '/bench/baseline';
  const fixtures = [
    'death-scene',
    'picnic',
    'suspense',
    'comedy-beat',
    'newscast',
    'children-story',
    'dialogue-performance',
  ];
  const pairs = [];
  for (const f of fixtures) {
    pairs.push({
      fixture: f,
      label: f,
      a: { system: 'piper', url: `${base}/piper/${f}.wav` },
      b: { system: 'kokoro', url: `${base}/kokoro/${f}.wav` },
    });
  }
  // identical anchor
  pairs.push({
    fixture: 'death-scene',
    label: 'ANCHOR identical',
    anchor: 'identical',
    a: { system: 'piper', url: `${base}/piper/death-scene.wav` },
    b: { system: 'piper', url: `${base}/piper/death-scene.wav` },
  });
  // degraded anchor — low bitrate if exists else same with flag
  const deg = path.join(ROOT, 'bench', 'baseline', 'degraded-death-scene.wav');
  if (!fs.existsSync(deg)) {
    // create degraded via ffmpeg if source exists
    const src = path.join(ROOT, 'bench', 'baseline', 'piper', 'death-scene.wav');
    if (fs.existsSync(src)) {
      const { spawnSync } = require('child_process');
      spawnSync(
        'ffmpeg',
        ['-y', '-i', src, '-ar', '8000', '-ac', '1', '-b:a', '16k', deg],
        { encoding: 'utf8' },
      );
    }
  }
  if (fs.existsSync(deg)) {
    pairs.push({
      fixture: 'death-scene',
      label: 'ANCHOR degraded',
      anchor: 'degraded',
      a: { system: 'piper', url: `${base}/piper/death-scene.wav` },
      b: { system: 'degraded', url: '/bench/baseline/degraded-death-scene.wav' },
    });
  }
  return pairs;
}

function aggregate(ledgerPath) {
  const lines = fs
    .readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const rows = lines.map((l) => JSON.parse(l));
  const nonAnchor = rows.filter((r) => !r.anchor);
  // If entries have _map, compute expressive vs piper
  let sum = 0;
  let n = 0;
  for (const r of nonAnchor) {
    const map = r._map;
    if (!map) continue;
    const systems = [map.A, map.B];
    if (systems.includes('expressive') && systems.includes('piper')) {
      let s = r.cmosAb;
      if (map.A === 'expressive') s = -s;
      sum += s;
      n++;
    }
  }
  const mean = n ? sum / n : null;
  // simple 95% CI approx
  let ci = null;
  if (n >= 2) {
    const scores = [];
    for (const r of nonAnchor) {
      const map = r._map;
      if (!map) continue;
      if (!( [map.A, map.B].includes('expressive') && [map.A, map.B].includes('piper'))) continue;
      let s = r.cmosAb;
      if (map.A === 'expressive') s = -s;
      scores.push(s);
    }
    const m = scores.reduce((a, b) => a + b, 0) / scores.length;
    const v =
      scores.reduce((a, b) => a + (b - m) ** 2, 0) / (scores.length - 1);
    const se = Math.sqrt(v / scores.length);
    ci = [m - 1.96 * se, m + 1.96 * se];
  }
  return { n, meanCmos: mean, ci95: ci, totalRows: rows.length };
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'build';
  if (cmd === 'build') {
    let seed = 42;
    let out = path.join(ROOT, 'ui', 'eval-lab', 'session-manifest.json');
    let sessionId;
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '--seed') seed = parseInt(argv[++i], 10);
      else if (argv[i] === '--out') out = path.resolve(argv[++i]);
      else if (argv[i] === '--session') sessionId = argv[++i];
    }
    const man = buildManifest({ seed, sessionId });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(man, null, 2));
    console.log(JSON.stringify({ wrote: out, trials: man.trials.length, seed }, null, 2));
  } else if (cmd === 'aggregate') {
    let ledger = path.join(ROOT, 'bench', 'eval', 'results.jsonl');
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '--ledger') ledger = path.resolve(argv[++i]);
    }
    const agg = aggregate(ledger);
    console.log(JSON.stringify(agg, null, 2));
  } else if (cmd === 'self-test') {
    const m1 = buildManifest({ seed: 7, sessionId: 'test' });
    const m2 = buildManifest({ seed: 7, sessionId: 'test' });
    // same seed → same trial order + presentation
    const ids1 = m1.trials.map((t) => t.id + t.presentation.A.system);
    const ids2 = m2.trials.map((t) => t.id + t.presentation.A.system);
    if (JSON.stringify(ids1) !== JSON.stringify(ids2)) {
      console.error('FAIL shuffle non-deterministic');
      process.exit(1);
    }
    // synthetic aggregate
    const tmp = path.join(ROOT, 'bench', 'eval', 'synthetic.jsonl');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    const lines = [
      JSON.stringify({ cmosAb: 1, _map: { A: 'piper', B: 'expressive' }, anchor: null }),
      JSON.stringify({ cmosAb: -1, _map: { A: 'expressive', B: 'piper' }, anchor: null }),
      JSON.stringify({ cmosAb: 0, _map: { A: 'piper', B: 'piper' }, anchor: 'identical' }),
    ];
    // first: B better expressive → +1
    // second: A is expressive, cmosAb=-1 means B(piper) worse → expressive better = -(-1)=+1
    fs.writeFileSync(tmp, lines.join('\n'));
    const agg = aggregate(tmp);
    if (agg.meanCmos == null || Math.abs(agg.meanCmos - 1) > 0.01) {
      console.error('FAIL aggregate math', agg);
      process.exit(1);
    }
    console.log(JSON.stringify({ selfTest: 'pass', agg }, null, 2));
  } else {
    console.error('Unknown command', cmd);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { buildManifest, aggregate, mulberry32, shuffle };
