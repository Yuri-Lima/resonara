#!/usr/bin/env node
/**
 * Automated objective-prosody-proxy harness (NOT human CMOS).
 *
 * Randomizes presentation file names and scores pairs with the defensible
 * relative proxy in objective-prosody-proxy.js. Writes a ledger BEFORE the
 * unblind map.
 *
 * CRITICAL METHODOLOGY:
 *   - This is NOT CMOS and does NOT certify Gate 2.
 *   - `certified: false` always. `pass` is never set true from the proxy.
 *   - Gate 2 certification requires a human blind panel (eval-lab + gate2-status).
 *   - Historical "mean CMOS +0.75 PASS" claims from the circular scorer are INVALID.
 *
 * Usage:
 *   node scripts/blind-gate.js --gate2
 *   node scripts/blind-gate.js --gate2 --expr-root bench/candidates/product-path --tag product-path
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scorePair } = require('./objective-prosody-proxy');

const ROOT = path.join(__dirname, '..');

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
  pairs.push({
    fixture: 'anchor-identical',
    a: 'bench/baseline/piper/death-scene.wav',
    b: 'bench/baseline/piper/death-scene.wav',
    anchor: 'identical',
  });

  const tagIdx = argv.indexOf('--tag');
  const tag =
    tagIdx >= 0 && argv[tagIdx + 1]
      ? argv[tagIdx + 1]
      : /product-path/.test(exprRoot)
        ? 'product-path'
        : /directed-final/.test(exprRoot)
          ? 'directed-final'
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
    const absA = path.isAbsolute(p.a) ? p.a : path.join(ROOT, p.a);
    const absB = path.isAbsolute(p.b) ? p.b : path.join(ROOT, p.b);
    if (!fs.existsSync(absA) || !fs.existsSync(absB)) {
      lines.push(
        JSON.stringify({
          fixture: p.fixture,
          skipped: true,
          reason: 'missing audio',
        }),
      );
      continue;
    }
    const flip =
      crypto.createHash('md5').update(String(seed) + p.fixture).digest()[0] %
        2 ===
      0;
    const left = flip ? absB : absA;
    const right = flip ? absA : absB;
    const idA = crypto.randomBytes(4).toString('hex');
    const idB = crypto.randomBytes(4).toString('hex');
    const fA = path.join(blindDir, `${idA}.wav`);
    const fB = path.join(blindDir, `${idB}.wav`);
    fs.copyFileSync(left, fA);
    fs.copyFileSync(right, fB);

    const sc = scorePair(fA, fB, p.fixture);
    let proxyAb = sc.proxyScore || 0;
    if (p.anchor === 'identical') {
      proxyAb = 0;
    }

    const entry = {
      trialId: p.fixture,
      timestamp: new Date().toISOString(),
      // Historical field name kept for ledger continuity; value is PROXY not CMOS
      cmosAb: proxyAb,
      proxyScoreAb: proxyAb,
      proxyRawScore: sc.rawScore,
      metricName: 'objective-prosody-proxy-v2',
      isHumanCmos: false,
      blindFiles: { A: path.basename(fA), B: path.basename(fB) },
      pmos: {
        pitch: 50 + Math.round((sc.dRange || 0) / 10),
        rhythm: 50,
        expressiveness: 50 + Math.round((sc.dDiv || 0) / 50),
      },
      anchor: p.anchor || null,
      _map: {
        A: flip ? 'expressive' : 'piper',
        B: flip ? 'piper' : 'expressive',
      },
    };
    lines.push(JSON.stringify(entry));

    if (!p.anchor && sc.proxyScore != null && !sc.error) {
      let s = proxyAb;
      if (entry._map.A === 'expressive') s = -s;
      sum += s;
      n++;
      unblind.push({
        fixture: p.fixture,
        proxyExpressiveVsPiper: s,
        // deprecated alias — do not interpret as human CMOS
        cmosExpressiveVsPiper: s,
        flip,
      });
    }
  }

  fs.writeFileSync(ledgerPath, lines.join('\n') + '\n');
  const mean = n ? sum / n : null;
  const summary = {
    gate,
    exprRoot,
    tag: tag || null,
    metricName: 'objective-prosody-proxy-v2',
    isHumanCmos: false,
    certified: false,
    // Explicit: automated proxy never certifies Gate 2
    gateStatus: 'NOT_CERTIFIED_AWAITING_HUMAN_PANEL',
    meanProxyExpressiveVsPiper: mean,
    // Deprecated field kept for tooling that still reads the name — NOT CMOS
    meanCmosExpressiveVsPiper: mean,
    n,
    // Never true from automated proxy
    pass: false,
    humanCmosNotRun: true,
    note:
      'Objective prosody proxy only. Not CMOS. Gate 2 requires human blind panel (ui/eval-lab).',
    ledger: ledgerPath,
    unblind,
  };
  if (/directed-final/i.test(exprRoot)) {
    summary.quarantine =
      'INVALID — post-hoc offline DSP (directed-final), not a product capability';
    summary.gateStatus = 'INVALID_POST_HOC_DSP';
  }
  fs.writeFileSync(mapPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  // Exit 0 always for proxy runs — certification is human-only (gate2-status.js)
}

if (require.main === module) main();
module.exports = { main };
