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
  const matrixState = readJson(path.join(ROOT, 'farm-output/matrix/state.json'));
  const soakState = readJson(path.join(ROOT, 'farm-output/soak/state.json'));
  const soakMem = readJson(path.join(ROOT, 'farm-output/soak/memory-curve.json'));
  const gate = readJson(path.join(ROOT, 'farm-output/metrics/gate-result.json'));
  const packaging = readJson(path.join(ROOT, 'farm-output/packaging/result.json'));
  const ledger = readJson(path.join(ROOT, 'reports/workstream-ledger.json'));
  const recs = readJson(path.join(ROOT, 'reports/matrix-recommendations.json'))
    || (matrixMetrics && matrixMetrics.recommendations) || {};

  const throughput = [];
  for (const st of [catalogState, matrixState, soakState]) {
    if (st && Array.isArray(st.throughput)) {
      for (const p of st.throughput) throughput.push({ ...p, batch: st.batch });
    }
  }

  const data = {
    generatedAt: new Date().toISOString(),
    verdict: (gate && gate.verdict) || 'PENDING',
    gates: gate || {},
    catalog: {
      rows: (catalogMetrics && catalogMetrics.rows) || [],
      aggregates: (catalogMetrics && catalogMetrics.aggregates) || {},
      state: catalogState,
    },
    matrix: {
      rows: (matrixMetrics && matrixMetrics.rows) || [],
      aggregates: (matrixMetrics && matrixMetrics.aggregates) || {},
      recommendations: recs,
      state: matrixState,
    },
    soak: {
      memory: soakMem || { samples: [], plateau: false },
      state: soakState,
    },
    throughput: {
      points: throughput.length ? throughput : ((catalogState && catalogState.throughput) || []),
      concurrency: (catalogState && catalogState.concurrency) || 3,
    },
    ledger: ledger || [],
    packaging: packaging || { mac: 'pending', win: 'pending' },
  };

  const out = path.join(ROOT, 'ui/deliverable/data.js');
  fs.writeFileSync(out, 'window.FARM_DATA = ' + JSON.stringify(data, null, 2) + ';\n', 'utf8');
  console.log(JSON.stringify({
    ok: true, out, verdict: data.verdict,
    catalogRows: data.catalog.rows.length,
    matrixRows: data.matrix.rows.length,
    soakSamples: (data.soak.memory.samples || []).length,
    ledger: data.ledger.length,
  }, null, 2));
}

main();
