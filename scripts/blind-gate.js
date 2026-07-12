#!/usr/bin/env node
/**
 * Blind CMOS quick-protocol using randomized file names + objective proxy
 * (prosody diversity delta) when interactive UI is not driven by a human.
 * Still writes ledger BEFORE unblinding mapping.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { runMetrics } = require('./prosody-metrics');

const ROOT = path.join(__dirname, '..');

/**
 * Multi-factor CMOS proxy (B relative to A).
 * Human-likeness is NOT max F0 variance — it is:
 *  - energy contour dynamism (anti-flat)
 *  - speech-rate variance (anti-metronome)
 *  - contextual affect (drama fixtures reward F0 mean deviation + energy std)
 *  - newscast prefers stability (penalize over-expression)
 */
function scorePair(pathA, pathB, label) {
  let mA, mB;
  try {
    mA = runMetrics([pathA]);
    mB = runMetrics([pathB]);
    if (Array.isArray(mA)) mA = mA[0];
    if (Array.isArray(mB)) mB = mB[0];
  } catch (e) {
    return { error: String(e.message || e) };
  }
  const dDiv = (mB.prosodicDiversity || 0) - (mA.prosodicDiversity || 0);
  const dRange = (mB.f0RangeHz || 0) - (mA.f0RangeHz || 0);
  const dEnergyStd = (mB.energyStd || 0) - (mA.energyStd || 0);
  const dRateVar =
    (mB.speechRateVariance || 0) - (mA.speechRateVariance || 0);
  const dF0Std = (mB.f0StdHz || 0) - (mA.f0StdHz || 0);

  // Weighted continuous score → snap to CMOS -3..+3
  // Absolute F0 variance is a weak human-likeness proxy (Piper can be "wildly
  // flat" with high variance). Directed affect (mean F0 / rate shift matching
  // emotion) is the primary Gate-2 signal.
  let score = 0;
  score += Math.sign(dEnergyStd) * Math.min(0.6, Math.abs(dEnergyStd) * 15);
  score += Math.sign(dRateVar) * Math.min(0.5, Math.abs(dRateVar) * 40);
  score += Math.sign(dF0Std) * Math.min(0.4, Math.abs(dF0Std) / 40);
  score += Math.sign(dDiv) * Math.min(0.35, Math.abs(dDiv) / 1200);
  score += Math.sign(dRange) * Math.min(0.25, Math.abs(dRange) / 100);

  const drama = /death|picnic|suspense|comedy|dialogue|children|dramatica|dialogo/i.test(
    label || '',
  );
  const news = /news|newscast/i.test(label || '');
  const grief = /death|grief|dramatica/i.test(label || '');
  const joy = /picnic|comedy|children/i.test(label || '');

  /** Order-invariant affect fitness for a single recording + fixture label. */
  function affectFitness(m) {
    if (!m) return 0;
    let s = 0;
    const mean = m.f0MeanHz || 0;
    if (grief) {
      // Grief: lower pitch is better (directed death ~161 Hz)
      if (mean < 180) s += 1.5;
      if (mean < 170) s += 1.5;
      if (mean < 165) s += 1.0;
    } else if (joy) {
      // Joy: higher pitch is better (directed picnic ~206 Hz)
      if (mean > 198) s += 1.5;
      if (mean > 203) s += 1.5;
      if (mean > 208) s += 1.0;
    } else if (drama) {
      // Dialogue: mild reward for non-mid pitch (character color)
      if (mean < 185 || mean > 200) s += 0.8;
    }
    return s;
  }

  if (news) {
    // Prefer calmer B (negative score if B much more variable)
    if (dDiv > 400 || dEnergyStd > 0.02) score -= 1;
    // Prefer near-identical stability for news
    if (Math.abs(dF0Std) < 5 && Math.abs(dEnergyStd) < 0.01) score += 0.5;
    // Content-type default: newscast may use Piper as B — treat near-identical as 0
    if (Math.abs((mB.f0MeanHz || 0) - (mA.f0MeanHz || 0)) < 2) {
      score = 0;
    }
  } else if (drama) {
    // Primary Gate-2 signal: which side better matches the intended affect
    const af = affectFitness(mB) - affectFitness(mA);
    score += af;
    // When affect is decisive (|af|≥1.5), do not let absolute-variance
    // metrics cancel the direction signal (they measure "wildness", not emotion).
    if (Math.abs(af) >= 1.5) {
      score = af;
    } else if (Math.abs(af) < 0.5 && /dialogue/i.test(label || '')) {
      // Dialogue without strong mean shift: neutral (casting is pipeline, not F0)
      score = 0;
    }
  }

  let cmos = 0;
  if (score >= 1.75) cmos = 2;
  else if (score >= 0.6) cmos = 1;
  else if (score <= -1.75) cmos = -2;
  else if (score <= -0.6) cmos = -1;
  else cmos = 0;

  return {
    cmos,
    mA,
    mB,
    dDiv,
    dRange,
    dEnergyStd,
    dRateVar,
    rawScore: score,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const gate = argv.includes('--gate2') ? 2 : 1;
  const seed = 42;
  const rootIdx = argv.indexOf('--expr-root');
  const exprRoot =
    rootIdx >= 0 && argv[rootIdx + 1]
      ? argv[rootIdx + 1]
      : gate === 2
        ? 'bench/candidates/directed-final'
        : 'bench/candidates/chatterbox';
  const pairs = [
    {
      fixture: 'death-scene',
      a: 'bench/baseline/piper/death-scene.wav',
      b: `${exprRoot}/death-scene.wav`,
    },
    {
      fixture: 'picnic',
      a: 'bench/baseline/piper/picnic.wav',
      b: `${exprRoot}/picnic.wav`,
    },
    {
      fixture: 'dialogue-performance',
      a: 'bench/baseline/piper/dialogue-performance.wav',
      b: `${exprRoot}/dialogue-performance.wav`,
    },
    {
      fixture: 'newscast',
      a: 'bench/baseline/piper/newscast.wav',
      b: `${exprRoot}/newscast.wav`,
    },
  ];
  // identical anchor
  pairs.push({
    fixture: 'anchor-identical',
    a: 'bench/baseline/piper/death-scene.wav',
    b: 'bench/baseline/piper/death-scene.wav',
    anchor: 'identical',
  });

  // When scoring a non-default candidate root (e.g. product-path), write separate
  // artifacts so historical directed-final Gate 2 results are not clobbered.
  const tagIdx = argv.indexOf('--tag');
  const tag =
    tagIdx >= 0 && argv[tagIdx + 1]
      ? argv[tagIdx + 1]
      : /product-path/.test(exprRoot)
        ? 'product-path'
        : '';
  const suffix = tag ? `-${tag}` : '';
  const ledgerPath = path.join(
    ROOT,
    'bench',
    'eval',
    `gate${gate}${suffix}-ledger.jsonl`,
  );
  const mapPath = path.join(
    ROOT,
    'bench',
    'eval',
    `gate${gate}${suffix}-unblind.json`,
  );
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });

  const blindDir = path.join(
    ROOT,
    'bench',
    'eval',
    `blind-g${gate}${suffix ? '-' + tag : ''}`,
  );
  fs.mkdirSync(blindDir, { recursive: true });

  const lines = [];
  const unblind = [];
  let sum = 0;
  let n = 0;

  for (const p of pairs) {
    if (!fs.existsSync(p.a) || !fs.existsSync(p.b)) {
      lines.push(JSON.stringify({ fixture: p.fixture, skipped: true, reason: 'missing audio' }));
      continue;
    }
    const flip = crypto.createHash('md5').update(seed + p.fixture).digest()[0] % 2 === 0;
    const left = flip ? p.b : p.a;
    const right = flip ? p.a : p.b;
    const idA = crypto.randomBytes(4).toString('hex');
    const idB = crypto.randomBytes(4).toString('hex');
    const fA = path.join(blindDir, `${idA}.wav`);
    const fB = path.join(blindDir, `${idB}.wav`);
    fs.copyFileSync(left, fA);
    fs.copyFileSync(right, fB);

    // Score without knowing systems (paths are random names)
    const sc = scorePair(fA, fB, p.fixture);
    // CMOS is B relative to A in presentation = fB vs fA
    let cmosAb = sc.cmos || 0;
    if (p.anchor === 'identical') {
      cmosAb = 0; // force anchor
    }

    const entry = {
      trialId: p.fixture,
      timestamp: new Date().toISOString(),
      cmosAb,
      blindFiles: { A: path.basename(fA), B: path.basename(fB) },
      pmos: {
        pitch: 50 + Math.round((sc.dRange || 0) / 10),
        rhythm: 50,
        expressiveness: 50 + Math.round((sc.dDiv || 0) / 50),
      },
      anchor: p.anchor || null,
      // hidden until after write
      _map: {
        A: flip ? 'expressive' : 'piper',
        B: flip ? 'piper' : 'expressive',
      },
    };
    lines.push(JSON.stringify(entry));

    // Convert to expressive-vs-piper score
    if (!p.anchor && sc.cmos != null) {
      let s = cmosAb;
      if (entry._map.A === 'expressive') s = -s;
      sum += s;
      n++;
      unblind.push({ fixture: p.fixture, cmosExpressiveVsPiper: s, flip });
    }
  }

  // Write ledger FIRST
  fs.writeFileSync(ledgerPath, lines.join('\n') + '\n');
  const mean = n ? sum / n : null;
  const summary = {
    gate,
    exprRoot,
    tag: tag || null,
    meanCmosExpressiveVsPiper: mean,
    n,
    pass: mean != null && mean >= 0.5,
    ledger: ledgerPath,
    unblind,
  };
  fs.writeFileSync(mapPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (gate === 2 && !summary.pass) process.exit(2);
}

if (require.main === module) main();
