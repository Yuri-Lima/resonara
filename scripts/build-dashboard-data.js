#!/usr/bin/env node
/** Merge farm metrics/state into ui/deliverable/data.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function main() {
  const catalogMetrics = readJson(path.join(ROOT, 'farm-output/metrics/catalog-metrics.json'))
    || readJson(path.join(ROOT, 'farm-output/metrics/farm-metrics.json'));
  const matrixMetrics = readJson(path.join(ROOT, 'farm-output/metrics/matrix-metrics.json'));
  const catalogState = readJson(path.join(ROOT, 'farm-output/catalog/state.json'));
  const soakMem = readJson(path.join(ROOT, 'farm-output/soak/memory-curve.json'));
  const gate = readJson(path.join(ROOT, 'farm-output/metrics/gate-result.json'));
  const packaging = readJson(path.join(ROOT, 'farm-output/packaging/result.json'));
  const ledger = readJson(path.join(ROOT, 'reports/workstream-ledger.json'));

  const data = {
    generatedAt: new Date().toISOString(),
    verdict: (gate && gate.verdict) || 'PENDING',
    catalog: {
      rows: (catalogMetrics && catalogMetrics.rows) || [],
      aggregates: (catalogMetrics && catalogMetrics.aggregates) || {},
    },
    matrix: {
      rows: (matrixMetrics && matrixMetrics.rows) || [],
      recommendations: (matrixMetrics && matrixMetrics.recommendations) || {},
    },
    soak: soakMem || { samples: [], plateau: false },
    throughput: {
      points: (catalogState && catalogState.throughput) || [],
      concurrency: (catalogState && catalogState.concurrency) || 3,
    },
    ledger: ledger || [],
    packaging: packaging || { mac: 'pending', win: 'pending' },
  };

  const out = path.join(ROOT, 'ui/deliverable/data.js');
  fs.writeFileSync(
    out,
    'window.FARM_DATA = ' + JSON.stringify(data, null, 2) + ';\n',
    'utf8',
  );
  console.log(JSON.stringify({ ok: true, out, verdict: data.verdict, catalogRows: data.catalog.rows.length, matrixRows: data.matrix.rows.length }, null, 2));
}

main();
