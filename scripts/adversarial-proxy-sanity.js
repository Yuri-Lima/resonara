#!/usr/bin/env node
/**
 * Adversarial sanity check for Gate-2-style scorers.
 *
 * Builds DSP-doctored audio that lands in the circular scorer's absolute F0
 * reward bands WITHOUT being more human (pitch-shift + heavy compression).
 *
 * Expected:
 *   - legacy circular scorer REWARDS the doctor (proves circularity bug)
 *   - objective-prosody-proxy-v2 does NOT reward the doctor vs natural Piper
 *
 * Usage: node scripts/adversarial-proxy-sanity.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  scorePair,
  legacyCircularScorePair,
} = require('./objective-prosody-proxy');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'bench', 'eval', 'adversarial');

function ffmpegAf(input, output, af) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-y',
      '-i',
      input,
      '-af',
      af,
      '-acodec',
      'pcm_s16le',
      '-ar',
      '22050',
      '-ac',
      '1',
      output,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || !fs.existsSync(output)) {
    throw new Error(`ffmpeg failed: ${(r.stderr || '').slice(-500)}`);
  }
}

function expressiveVsPiper(sc, flip) {
  // scorePair is B relative to A. When flip=false: A=piper B=candidate.
  // Positive sc.proxyScore means B better. We want candidate-vs-piper.
  // In our calls we always put piper as A and candidate as B (no flip).
  return sc.proxyScore;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const piperDeath = path.join(
    ROOT,
    'bench',
    'baseline',
    'piper',
    'death-scene.wav',
  );
  const piperPicnic = path.join(
    ROOT,
    'bench',
    'baseline',
    'piper',
    'picnic.wav',
  );
  if (!fs.existsSync(piperDeath) || !fs.existsSync(piperPicnic)) {
    console.error('Missing Piper baselines — cannot run adversarial test');
    process.exit(1);
  }

  // Doctor: force F0 into circular grief band (~lower pitch) + flatten dynamics
  // asetrate factor <1 lowers pitch; heavy compressor kills natural energy contour
  const griefDoctor = path.join(OUT_DIR, 'doctor-grief-band.wav');
  ffmpegAf(
    piperDeath,
    griefDoctor,
    'asetrate=22050*0.84,aresample=22050,acompressor=threshold=-28dB:ratio=10:attack=5:release=50,alimiter=limit=0.9,lowpass=f=3500',
  );

  // Doctor: force F0 into circular joy band (~higher pitch) + flatten
  const joyDoctor = path.join(OUT_DIR, 'doctor-joy-band.wav');
  ffmpegAf(
    piperPicnic,
    joyDoctor,
    'asetrate=22050*1.08,aresample=22050,acompressor=threshold=-28dB:ratio=10:attack=5:release=50,alimiter=limit=0.9,highpass=f=200',
  );

  const results = [];

  // A = piper, B = doctor → positive means doctor preferred
  const legGrief = legacyCircularScorePair(piperDeath, griefDoctor, 'death-scene');
  const legJoy = legacyCircularScorePair(piperPicnic, joyDoctor, 'picnic');
  const newGrief = scorePair(piperDeath, griefDoctor, 'death-scene');
  const newJoy = scorePair(piperPicnic, joyDoctor, 'picnic');

  results.push({
    case: 'grief-band-doctor-vs-piper',
    doctor: path.relative(ROOT, griefDoctor),
    doctorF0Mean: newGrief.mB && newGrief.mB.f0MeanHz,
    piperF0Mean: newGrief.mA && newGrief.mA.f0MeanHz,
    legacyCircularPrefersDoctor: (legGrief.proxyScore || 0) > 0,
    legacyProxyScoreDoctorVsPiper: legGrief.proxyScore,
    legacyRaw: legGrief.rawScore,
    v2PrefersDoctor: (newGrief.proxyScore || 0) > 0,
    v2ProxyScoreDoctorVsPiper: newGrief.proxyScore,
    v2Raw: newGrief.rawScore,
  });
  results.push({
    case: 'joy-band-doctor-vs-piper',
    doctor: path.relative(ROOT, joyDoctor),
    doctorF0Mean: newJoy.mB && newJoy.mB.f0MeanHz,
    piperF0Mean: newJoy.mA && newJoy.mA.f0MeanHz,
    legacyCircularPrefersDoctor: (legJoy.proxyScore || 0) > 0,
    legacyProxyScoreDoctorVsPiper: legJoy.proxyScore,
    legacyRaw: legJoy.rawScore,
    v2PrefersDoctor: (newJoy.proxyScore || 0) > 0,
    v2ProxyScoreDoctorVsPiper: newJoy.proxyScore,
    v2Raw: newJoy.rawScore,
  });

  const legacyRewardsDoctor = results.some((r) => r.legacyCircularPrefersDoctor);
  const v2RewardsDoctor = results.some((r) => r.v2PrefersDoctor);

  const report = {
    title: 'Adversarial proxy sanity',
    principle:
      'DSP-doctored audio that only hits absolute F0 reward bands must not be preferred over natural Piper.',
    legacyCircularInvalid: legacyRewardsDoctor,
    legacyNote: legacyRewardsDoctor
      ? 'INVALID — circular scorer rewards F0-band doctor (as expected of the bug)'
      : 'Unexpected: legacy did not reward doctor; check F0 landing',
    v2Valid: !v2RewardsDoctor,
    v2Note: v2RewardsDoctor
      ? 'INVALID — v2 still rewards doctor; proxy must not be used'
      : 'OK — v2 does not prefer F0-band doctor over Piper',
    results,
    conclusion: !v2RewardsDoctor
      ? 'objective-prosody-proxy-v2 passes adversarial sanity; still NOT human CMOS and NOT a Gate 2 pass'
      : 'objective-prosody-proxy-v2 FAILS adversarial sanity — do not report proxy as evidence',
  };

  const outJson = path.join(OUT_DIR, 'adversarial-report.json');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (v2RewardsDoctor) {
    process.exitCode = 2;
  }
  // Also fail hard if legacy does NOT demonstrate the bug (test is then weak)
  if (!legacyRewardsDoctor) {
    console.error(
      'WARN: legacy circular scorer did not reward doctor — adversarial setup may need retune',
    );
    // don't exit 2 if v2 is ok; warn only
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
