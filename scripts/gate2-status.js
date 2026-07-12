#!/usr/bin/env node
/**
 * Honest Gate 2 status.
 *
 * Certification rule:
 *   ONLY a human blind CMOS session (eval-lab) with passing anchor sanity
 *   may set gateStatus to CERTIFIED_PASS or CERTIFIED_FAIL.
 *
 * Automated objective-prosody-proxy scores never certify.
 *
 * Usage:
 *   node scripts/gate2-status.js
 *   node scripts/gate2-status.js --write bench/eval/gate2-status.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HUMAN_DIR = path.join(ROOT, 'bench', 'eval', 'human-sessions');

function listHumanLedgers() {
  if (!fs.existsSync(HUMAN_DIR)) return [];
  return fs
    .readdirSync(HUMAN_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(HUMAN_DIR, f));
}

function aggregateHuman(ledgerPath) {
  const lines = fs
    .readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const rows = lines.map((l) => JSON.parse(l));
  let anchorOk = true;
  const notes = [];
  for (const r of rows) {
    if (r.anchor === 'identical' && Math.abs(r.cmosAb) > 1) {
      anchorOk = false;
      notes.push('identical |cmos|>1');
    }
  }
  let sum = 0;
  let n = 0;
  const per = [];
  for (const r of rows) {
    if (r.anchor) continue;
    const map = r._map;
    if (!map) continue;
    if (
      ![map.A, map.B].includes('expressive') ||
      ![map.A, map.B].includes('piper')
    ) {
      continue;
    }
    if (r.isHumanCmos === false) continue; // skip proxy-only rows if mixed
    let s = r.cmosAb;
    if (map.A === 'expressive') s = -s;
    sum += s;
    n++;
    per.push({ fixture: r.fixture || r.trialId, humanCmosExpressiveVsPiper: s });
  }
  // Accept human ledgers that omit isHumanCmos (UI default = human)
  if (n === 0) {
    for (const r of rows) {
      if (r.anchor) continue;
      const map = r._map;
      if (!map) continue;
      if (
        ![map.A, map.B].includes('expressive') ||
        ![map.A, map.B].includes('piper')
      ) {
        continue;
      }
      if (r.metricName && /proxy/i.test(r.metricName)) continue;
      let s = r.cmosAb;
      if (map.A === 'expressive') s = -s;
      sum += s;
      n++;
      per.push({
        fixture: r.fixture || r.trialId,
        humanCmosExpressiveVsPiper: s,
      });
    }
  }
  return {
    ledger: path.relative(ROOT, ledgerPath),
    n,
    meanHumanCmos: n ? sum / n : null,
    anchorOk,
    notes,
    per,
  };
}

function readProxySummary(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const writeIdx = argv.indexOf('--write');
  const writePath =
    writeIdx >= 0
      ? path.resolve(argv[writeIdx + 1] || path.join(ROOT, 'bench', 'eval', 'gate2-status.json'))
      : path.join(ROOT, 'bench', 'eval', 'gate2-status.json');

  const humanLedgers = listHumanLedgers();
  const humanAggs = humanLedgers.map(aggregateHuman).filter((a) => a.n > 0);

  let status = {
    gate: 2,
    path: 1,
    pathDescription:
      'Human blind CMOS panel (eval-lab) is the only certifying measurement',
    gateStatus: 'NOT_CERTIFIED_AWAITING_HUMAN_PANEL',
    certified: false,
    pass: false,
    humanSessions: humanAggs,
    proxyDiagnostics: {
      productPath: readProxySummary(
        path.join(ROOT, 'bench', 'eval', 'gate2-product-path-unblind.json'),
      ),
      directedFinal: readProxySummary(
        path.join(ROOT, 'bench', 'eval', 'gate2-unblind.json'),
      ),
    },
    invalidClaims: [
      {
        claim: 'Offline Gate 2 CMOS +1.0 PASS (directed-final)',
        status: 'INVALID_POST_HOC_DSP',
        reason:
          'Post-hoc offline ffmpeg AF on raw Chatterbox; not product path; scored by circular proxy',
      },
      {
        claim: 'Product-path Gate 2 CMOS +0.75 PASS',
        status: 'INVALID_CIRCULAR_PROXY',
        reason:
          'Automated affectFitness() used absolute F0 bands reverse-engineered from target audio; not human CMOS',
      },
    ],
    howToCertify: [
      '1. npm run eval:gate2:manifest  # builds ui/eval-lab/session-manifest-gate2.json',
      '2. Start Resonara (serves /bench + /ui); open /ui/eval-lab/',
      '3. Load Gate 2 manifest; score all trials including identical anchor',
      '4. Download ledger JSONL → bench/eval/human-sessions/<id>.jsonl',
      '5. node scripts/gate2-status.js --write  # recompute certification',
    ],
    updatedAt: new Date().toISOString(),
  };

  if (humanAggs.length) {
    // Use latest session with n>=4 and anchor ok
    const eligible = humanAggs.filter((a) => a.n >= 4 && a.anchorOk);
    if (eligible.length) {
      const best = eligible[eligible.length - 1];
      status.certified = true;
      status.meanHumanCmos = best.meanHumanCmos;
      status.n = best.n;
      status.humanLedger = best.ledger;
      status.pass = best.meanHumanCmos != null && best.meanHumanCmos >= 0.5;
      status.gateStatus = status.pass
        ? 'CERTIFIED_PASS'
        : 'CERTIFIED_FAIL';
    } else {
      status.gateStatus = 'NOT_CERTIFIED_HUMAN_SESSION_INVALID';
      status.note =
        'Human ledger(s) present but failed anchor sanity or n<4';
    }
  }

  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  fs.writeFileSync(writePath, JSON.stringify(status, null, 2));
  console.log(JSON.stringify(status, null, 2));
  // exit 0 even when not certified — honest waiting state is success
}

if (require.main === module) main();
module.exports = { main, aggregateHuman };
