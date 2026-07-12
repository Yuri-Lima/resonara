#!/usr/bin/env node
/**
 * Release-qualification gate over farm metrics.
 * Exit 0 = GO, exit 1 = NO-GO.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const DEFAULTS = {
  maxMeanWer: 0.35,
  minConformance: 0.9,
  maxInvalidAudio: 0,
  maxFailRate: 0.05,
  maxMeanRtf: 5.0,
};

function evaluate(metrics, thresholds = DEFAULTS) {
  const a = metrics.aggregates || {};
  const findings = [];
  let go = true;

  if ((a.invalidAudio || 0) > thresholds.maxInvalidAudio) {
    go = false;
    findings.push({ code: 'INVALID_AUDIO', detail: a.invalidAudio });
  }
  if (a.meanWer != null && a.meanWer > thresholds.maxMeanWer) {
    go = false;
    findings.push({ code: 'WER', detail: a.meanWer, threshold: thresholds.maxMeanWer });
  }
  if (a.meanConformance != null && a.meanConformance < thresholds.minConformance) {
    go = false;
    findings.push({ code: 'PAUSE_CONFORMANCE', detail: a.meanConformance, threshold: thresholds.minConformance });
  }
  if (a.meanRtf != null && a.meanRtf > thresholds.maxMeanRtf) {
    go = false;
    findings.push({ code: 'RTF', detail: a.meanRtf, threshold: thresholds.maxMeanRtf });
  }
  const failRate = a.total ? (a.failed || 0) / a.total : 0;
  if (failRate > thresholds.maxFailRate) {
    go = false;
    findings.push({ code: 'FAIL_RATE', detail: failRate, threshold: thresholds.maxFailRate });
  }

  return {
    verdict: go ? 'GO' : 'NO-GO',
    findings,
    aggregates: a,
    thresholds,
  };
}

function main() {
  const args = process.argv.slice(2);
  let metricsPath = path.join(ROOT, 'farm-output/metrics/farm-metrics.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--metrics') metricsPath = args[++i];
  }
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const result = evaluate(metrics);
  const outPath = path.join(ROOT, 'farm-output/metrics/gate-result.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === 'GO' ? 0 : 1);
}

module.exports = { evaluate, DEFAULTS };

if (require.main === module) main();
