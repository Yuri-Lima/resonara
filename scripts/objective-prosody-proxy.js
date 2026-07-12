#!/usr/bin/env node
/**
 * Objective prosody proxy (NOT CMOS, NOT a shipping gate).
 *
 * Design principles (a priori — independent of candidate F0 measurements):
 *   1. Relative comparisons only (B − A deltas). No absolute F0 Hz reward bands.
 *   2. Anti-flat energy: natural speech tends to have more RMS contour motion
 *      (see energy-based prosody literature; used as a weak relative signal).
 *   3. Anti-metronome rate: cross-segment rate variance is a weak naturalness cue.
 *   4. Newscast a priori prefers stability (lower variance better for news content).
 *   5. Drama fixtures do NOT get absolute mean-F0 band rewards — those were the
 *      circular bug (thresholds reverse-engineered from directed-final audio).
 *
 * This module NEVER claims CMOS and NEVER certifies Gate 2.
 * Gate 2 certification requires a human blind panel (see gate2-status.js).
 */
'use strict';

const { runMetrics } = require('./prosody-metrics');

/**
 * LEGACY circular scorer — preserved only so adversarial tests can prove the bug.
 * DO NOT use for product decisions.
 */
function legacyCircularAffectFitness(m, label) {
  if (!m) return 0;
  let s = 0;
  const mean = m.f0MeanHz || 0;
  const grief = /death|grief|dramatica/i.test(label || '');
  const joy = /picnic|comedy|children/i.test(label || '');
  const drama = /death|picnic|suspense|comedy|dialogue|children|dramatica|dialogo/i.test(
    label || '',
  );
  if (grief) {
    // BUG: thresholds reverse-engineered from directed death ~161 Hz
    if (mean < 180) s += 1.5;
    if (mean < 170) s += 1.5;
    if (mean < 165) s += 1.0;
  } else if (joy) {
    // BUG: thresholds reverse-engineered from directed picnic ~206 Hz
    if (mean > 198) s += 1.5;
    if (mean > 203) s += 1.5;
    if (mean > 208) s += 1.0;
  } else if (drama) {
    if (mean < 185 || mean > 200) s += 0.8;
  }
  return s;
}

function legacyCircularScorePair(pathA, pathB, label) {
  let mA, mB;
  try {
    mA = runMetrics([pathA]);
    mB = runMetrics([pathB]);
    if (Array.isArray(mA)) mA = mA[0];
    if (Array.isArray(mB)) mB = mB[0];
  } catch (e) {
    return { error: String(e.message || e) };
  }
  const dEnergyStd = (mB.energyStd || 0) - (mA.energyStd || 0);
  const dRateVar =
    (mB.speechRateVariance || 0) - (mA.speechRateVariance || 0);
  const dF0Std = (mB.f0StdHz || 0) - (mA.f0StdHz || 0);
  const dDiv = (mB.prosodicDiversity || 0) - (mA.prosodicDiversity || 0);
  const dRange = (mB.f0RangeHz || 0) - (mA.f0RangeHz || 0);

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
  if (news) {
    if (dDiv > 400 || dEnergyStd > 0.02) score -= 1;
    if (Math.abs(dF0Std) < 5 && Math.abs(dEnergyStd) < 0.01) score += 0.5;
    if (Math.abs((mB.f0MeanHz || 0) - (mA.f0MeanHz || 0)) < 2) score = 0;
  } else if (drama) {
    const af =
      legacyCircularAffectFitness(mB, label) -
      legacyCircularAffectFitness(mA, label);
    score += af;
    if (Math.abs(af) >= 1.5) score = af;
    else if (Math.abs(af) < 0.5 && /dialogue/i.test(label || '')) score = 0;
  }

  let snapped = 0;
  if (score >= 1.75) snapped = 2;
  else if (score >= 0.6) snapped = 1;
  else if (score <= -1.75) snapped = -2;
  else if (score <= -0.6) snapped = -1;

  return {
    proxyScore: snapped,
    rawScore: score,
    mA,
    mB,
    circular: true,
    dEnergyStd,
    dRateVar,
  };
}

/**
 * Defensible objective prosody proxy (relative only, no absolute F0 bands).
 * Returns continuous rawScore and a coarse snap in {-2,-1,0,1,2} for ledgers.
 * Never interpret as MOS/CMOS.
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

  const dEnergyStd = (mB.energyStd || 0) - (mA.energyStd || 0);
  const dRateVar =
    (mB.speechRateVariance || 0) - (mA.speechRateVariance || 0);
  const dF0Std = (mB.f0StdHz || 0) - (mA.f0StdHz || 0);
  const dDiv = (mB.prosodicDiversity || 0) - (mA.prosodicDiversity || 0);
  const dRange = (mB.f0RangeHz || 0) - (mA.f0RangeHz || 0);

  const news = /news|newscast/i.test(label || '');

  let score = 0;
  // Relative anti-flat / anti-metronome (a priori weak naturalness cues)
  score += Math.sign(dEnergyStd) * Math.min(0.6, Math.abs(dEnergyStd) * 15);
  score += Math.sign(dRateVar) * Math.min(0.5, Math.abs(dRateVar) * 40);
  score += Math.sign(dF0Std) * Math.min(0.35, Math.abs(dF0Std) / 50);
  score += Math.sign(dDiv) * Math.min(0.3, Math.abs(dDiv) / 1500);
  score += Math.sign(dRange) * Math.min(0.2, Math.abs(dRange) / 120);

  if (news) {
    // A priori: news content prefers stability — invert variance preference
    score = 0;
    score -= Math.sign(dEnergyStd) * Math.min(0.5, Math.abs(dEnergyStd) * 12);
    score -= Math.sign(dF0Std) * Math.min(0.4, Math.abs(dF0Std) / 40);
    if (Math.abs((mB.f0MeanHz || 0) - (mA.f0MeanHz || 0)) < 2) {
      score = 0;
    }
  }

  // Explicitly NO absolute mean-F0 band rewards (the circular defect).

  let snap = 0;
  if (score >= 1.75) snap = 2;
  else if (score >= 0.6) snap = 1;
  else if (score <= -1.75) snap = -2;
  else if (score <= -0.6) snap = -1;

  return {
    proxyScore: snap,
    rawScore: score,
    mA,
    mB,
    circular: false,
    metricName: 'objective-prosody-proxy-v2',
    dEnergyStd,
    dRateVar,
    dF0Std,
    dDiv,
    dRange,
  };
}

module.exports = {
  scorePair,
  legacyCircularScorePair,
  legacyCircularAffectFitness,
};
