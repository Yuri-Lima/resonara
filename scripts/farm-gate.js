#!/usr/bin/env node
/**
 * Release-qualification gate over farm metrics.
 * Exit 0 = GO, exit 1 = NO-GO.
 *
 * Honesty rules (G31):
 *  - Proxy WER (duration-density) must NEVER clear the WER floor as if measured.
 *  - Pause conformance must come from pause-probe profile-band, not silencedetect.
 *  - Findings name the breach; thresholds are not loosened to accommodate proxies.
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
  const methodology = metrics.methodology || {};
  const rows = Array.isArray(metrics.rows) ? metrics.rows : [];
  const findings = [];
  let go = true;

  // ── methodology honesty ──────────────────────────────────────────────
  const measuredWerCount =
    a.measuredWerCount != null
      ? a.measuredWerCount
      : rows.filter((r) => r.wer != null && !r.werIsProxy).length;
  const proxyWerCount =
    a.proxyWerCount != null
      ? a.proxyWerCount
      : rows.filter((r) => r.wer != null && r.werIsProxy).length;
  const realPauseCount =
    a.realPauseCount != null
      ? a.realPauseCount
      : rows.filter(
          (r) =>
            r.pauseConformance != null &&
            r.method &&
            r.method.pause === 'pause-probe-profile-band',
        ).length;
  const proxyPauseCount =
    a.proxyPauseCount != null
      ? a.proxyPauseCount
      : rows.filter(
          (r) =>
            r.pauseConformance != null &&
            (!r.method || r.method.pause !== 'pause-probe-profile-band'),
        ).length;

  // Proxy-only WER cannot clear the gate
  if (measuredWerCount === 0 && proxyWerCount > 0) {
    go = false;
    findings.push({
      code: 'WER_PROXY_ONLY',
      detail:
        'All WER values are duration-density proxies (werIsProxy=true). A proxy labeled as WER is a gate failure — install whisper and re-measure with FARM_MEASURE_WHISPER=1.',
      proxyWerCount,
      methodology: methodology.wer || 'duration-density-proxy-only',
    });
  } else if (measuredWerCount === 0 && proxyWerCount === 0 && rows.length > 0) {
    go = false;
    findings.push({
      code: 'WER_UNAVAILABLE',
      detail: 'No WER values present (whisper unavailable and proxy not computed).',
    });
  }

  // Mixed: still gate on measured only, but surface proxy contamination
  if (proxyWerCount > 0 && measuredWerCount > 0) {
    findings.push({
      code: 'WER_MIXED_PROXY',
      detail: `${proxyWerCount} proxy WER rows excluded from meanWerMeasured; gate uses ASR-measured only.`,
      measuredWerCount,
      proxyWerCount,
      severity: 'warning',
    });
  }

  // Pause must be real profile-band probe
  if (realPauseCount === 0 && (proxyPauseCount > 0 || a.meanConformance != null)) {
    go = false;
    findings.push({
      code: 'PAUSE_PROXY_ONLY',
      detail:
        'Pause conformance is not from pause-probe profile-band (e.g. ffmpeg-silencedetect constant). Re-measure with the real harness.',
      proxyPauseCount,
      realPauseCount,
    });
  }

  if ((a.invalidAudio || 0) > thresholds.maxInvalidAudio) {
    go = false;
    findings.push({ code: 'INVALID_AUDIO', detail: a.invalidAudio });
  }

  // WER floor applies ONLY to measured ASR WER
  const werForGate =
    a.meanWerMeasured != null
      ? a.meanWerMeasured
      : measuredWerCount > 0
        ? a.meanWer
        : null;
  if (werForGate != null && werForGate > thresholds.maxMeanWer) {
    go = false;
    findings.push({
      code: 'WER',
      detail: werForGate,
      threshold: thresholds.maxMeanWer,
      source: 'meanWerMeasured',
      measuredWerCount,
    });
  }

  // Per-row measured WER breaches (systematic cell findings)
  const werBreaches = rows.filter(
    (r) =>
      (r.status === 'ok' || r.status === 'measured') &&
      r.wer != null &&
      !r.werIsProxy &&
      r.wer > thresholds.maxMeanWer,
  );
  if (werBreaches.length) {
    go = false;
    findings.push({
      code: 'WER_CELL_BREACH',
      detail: werBreaches.map((r) => ({
        id: r.id,
        wer: r.wer,
        engine: r.engine,
        profile: r.profile,
        contentType: r.contentType,
      })),
      threshold: thresholds.maxMeanWer,
    });
  }

  const confForGate =
    a.meanConformanceReal != null ? a.meanConformanceReal : a.meanConformance;
  if (confForGate != null && confForGate < thresholds.minConformance) {
    go = false;
    findings.push({
      code: 'PAUSE_CONFORMANCE',
      detail: confForGate,
      threshold: thresholds.minConformance,
      source: a.meanConformanceReal != null ? 'meanConformanceReal' : 'meanConformance',
    });
  }

  const confBreaches = rows.filter(
    (r) =>
      (r.status === 'ok' || r.status === 'measured') &&
      r.pauseConformance != null &&
      !r.pauseIsProxy &&
      r.pauseConformance < thresholds.minConformance,
  );
  if (confBreaches.length) {
    go = false;
    findings.push({
      code: 'PAUSE_CELL_BREACH',
      detail: confBreaches.map((r) => ({
        id: r.id,
        pauseConformance: r.pauseConformance,
        engine: r.engine,
        profile: r.profile,
      })),
      threshold: thresholds.minConformance,
    });
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
    aggregates: {
      ...a,
      measuredWerCount,
      proxyWerCount,
      realPauseCount,
      proxyPauseCount,
      werForGate,
      confForGate,
    },
    methodology: {
      ...methodology,
      measuredWerCount,
      proxyWerCount,
      realPauseCount,
      proxyPauseCount,
      honesty:
        measuredWerCount > 0 && realPauseCount > 0
          ? 'gate-on-measured-wer-and-profile-band-pause'
          : 'incomplete-measurement',
    },
    thresholds,
  };
}

function main() {
  const args = process.argv.slice(2);
  let metricsPath = path.join(ROOT, 'farm-output/metrics/farm-metrics.json');
  let outPath = path.join(ROOT, 'farm-output/metrics/gate-result.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--metrics') metricsPath = args[++i];
    else if (args[i] === '--out') outPath = args[++i];
  }
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const result = evaluate(metrics);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === 'GO' ? 0 : 1);
}

module.exports = { evaluate, DEFAULTS };

if (require.main === module) main();
