#!/usr/bin/env node
/**
 * Re-certify Gate 2 using the **product direction path** (not offline hand filters):
 *   autoDirect → REM compile → buildExpressionRuntime → Chatterbox → directed AF (humanize)
 *
 * Writes:
 *   bench/candidates/product-path/*.wav
 *   bench/eval/gate2-product-path-{ledger.jsonl,unblind.json,report.md}
 *
 * Usage:
 *   node scripts/recert-gate2-product-path.js
 *   node scripts/recert-gate2-product-path.js --skip-render   # score existing WAVs only
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'bench', 'candidates', 'product-path');
const EVAL_DIR = path.join(ROOT, 'bench', 'eval');

const FIXTURES = [
  'death-scene',
  'picnic',
  'dialogue-performance',
  'newscast',
];

function loadProductModules() {
  // Prefer compiled dist (same code Nest serves)
  const base = fs.existsSync(path.join(ROOT, 'dist', 'tts', 'expression', 'direction-runtime.js'))
    ? path.join(ROOT, 'dist', 'tts', 'expression')
    : null;
  if (!base) {
    throw new Error('dist/tts/expression missing — run: npm run build');
  }
  return {
    applyAutoDirection: require(path.join(base, 'auto-direction')).applyAutoDirection,
    injectBreathMarkers: require(path.join(base, 'humanization')).injectBreathMarkers,
    compileRem: require(path.join(base, 'rem-compiler')).compileRem,
    buildExpressionRuntime: require(path.join(base, 'direction-runtime'))
      .buildExpressionRuntime,
    expressionAudioFilter: require(path.join(base, 'direction-runtime'))
      .expressionAudioFilter,
  };
}

function styleForFixture(name) {
  if (name === 'newscast') return 'news';
  if (name === 'dialogue-performance') return 'podcast';
  return 'audiobook';
}

function prepareText(mod, raw, fixture) {
  let text = raw.trim();
  const styleProfile = styleForFixture(fixture);
  const directed = mod.applyAutoDirection(text, {
    enabled: true,
    language: 'en',
    defaultStyle:
      styleProfile === 'news'
        ? 'newscast'
        : styleProfile === 'podcast'
          ? 'conversational'
          : 'narrative',
  });
  if (directed.applied) text = directed.text;

  const breathed = mod.injectBreathMarkers(text, {
    profile: styleProfile === 'news' ? 'news' : 'audiobook',
    breaths: styleProfile !== 'news',
  });
  if (breathed.count > 0) text = breathed.text;

  const compiled = mod.compileRem(text, 'expressive');
  const runtime = mod.buildExpressionRuntime({
    engine: 'expressive',
    plainText: text,
    humanize: true,
    styleProfile,
    compiled,
  });
  return { text: runtime.engineText, runtime, styleProfile };
}

function synthExpressive(text, outWav, exaggeration) {
  const py =
    process.env.EXPRESSIVE_PYTHON ||
    path.join(ROOT, 'tools', 'expressive-venv', 'bin', 'python');
  const script = path.join(ROOT, 'tools', 'expressive', 'synthesize.py');
  if (!fs.existsSync(py) || !fs.existsSync(script)) {
    throw new Error('expressive runtime missing');
  }
  const args = [
    script,
    '--text',
    text,
    '--output',
    outWav,
    '--voice',
    'expressive:chatterbox-turbo',
    '--exaggeration',
    String(exaggeration),
  ];
  const r = spawnSync(py, args, {
    encoding: 'utf8',
    maxBuffer: 80 * 1024 * 1024,
    env: { ...process.env },
    timeout: 900_000,
  });
  if (r.status !== 0 || !fs.existsSync(outWav)) {
    throw new Error(
      `expressive synth failed: ${(r.stderr || r.stdout || '').slice(0, 1500)}`,
    );
  }
  return (r.stderr || '').slice(-400);
}

function applyAf(inWav, outWav, filterGraph) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-y',
      '-i',
      inWav,
      '-af',
      filterGraph,
      '-acodec',
      'pcm_s16le',
      outWav,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || !fs.existsSync(outWav)) {
    throw new Error(`ffmpeg AF failed: ${(r.stderr || '').slice(0, 800)}`);
  }
}

function renderOne(mod, fixture) {
  const src = path.join(ROOT, 'samples', 'expressive', `${fixture}.txt`);
  if (!fs.existsSync(src)) throw new Error(`missing ${src}`);
  const raw = fs.readFileSync(src, 'utf8');
  const { text, runtime, styleProfile } = prepareText(mod, raw, fixture);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pre = path.join(OUT_DIR, `${fixture}.pre.wav`);
  const out = path.join(OUT_DIR, `${fixture}.wav`);
  const metaPath = path.join(OUT_DIR, `${fixture}.expression.json`);

  console.error(`[render] ${fixture} affect=${runtime.affect} exag=${runtime.exaggeration.toFixed(2)} chars=${text.length}`);
  const log = synthExpressive(text, pre, runtime.exaggeration);
  const af = mod.expressionAudioFilter({
    humanize: true,
    affect: runtime.affect,
  });
  if (af) {
    applyAf(pre, out, af);
  } else {
    fs.copyFileSync(pre, out);
  }
  try {
    fs.unlinkSync(pre);
  } catch {
    /* */
  }

  const meta = {
    fixture,
    productPath: true,
    styleProfile,
    affect: runtime.affect,
    exaggeration: runtime.exaggeration,
    humanize: true,
    autoDirect: true,
    engine: 'expressive',
    af,
    textChars: text.length,
    synthLogTail: log,
    multiControl: runtime.multiControl,
    remWarnings: runtime.remWarnings,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

function runBlindGateProduct() {
  const gateScript = path.join(ROOT, 'scripts', 'blind-gate.js');
  const r = spawnSync(
    process.execPath,
    [
      gateScript,
      '--gate2',
      '--expr-root',
      'bench/candidates/product-path',
      '--tag',
      'product-path',
    ],
    { encoding: 'utf8', cwd: ROOT },
  );
  process.stderr.write(r.stderr || '');
  process.stdout.write(r.stdout || '');
  if (r.status !== 0 && r.status !== 2) {
    throw new Error(`blind-gate failed status=${r.status}`);
  }
  const mapPath = path.join(EVAL_DIR, 'gate2-product-path-unblind.json');
  if (fs.existsSync(mapPath)) {
    const j = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    j.source = 'product-path';
    j.note =
      'Objective prosody proxy only on product-path WAVs. NOT human CMOS. NOT a Gate 2 pass.';
    j.gateStatus = 'NOT_CERTIFIED_AWAITING_HUMAN_PANEL';
    j.certified = false;
    j.pass = false;
    j.humanCmosNotRun = true;
    fs.writeFileSync(mapPath, JSON.stringify(j, null, 2));
    return j;
  }
  return null;
}

function writeReport(summary, metas) {
  const lines = [
    '# Gate 2 product-path — diagnostic render + proxy (NOT certified)',
    '',
    `**Date:** ${new Date().toISOString()}`,
    `**Source:** \`bench/candidates/product-path/\` (live product direction path)`,
    '',
    '## Pipeline',
    '',
    '1. `applyAutoDirection` (style prefix)',
    '2. `injectBreathMarkers` when humanize',
    '3. `compileRem` + `buildExpressionRuntime` (exaggeration, content affect, multiControl)',
    '4. `tools/expressive/synthesize.py` with **runtime exaggeration** (not hardcoded 0.55)',
    '5. `expressionAudioFilter` → ffmpeg `-af` (same graphs as `directedAudioFilter`)',
    '',
    '## Per-fixture expression',
    '',
    '| Fixture | Affect | Exaggeration | AF |',
    '|---------|--------|--------------|----|',
  ];
  for (const m of metas) {
    lines.push(
      `| ${m.fixture} | ${m.affect} | ${m.exaggeration.toFixed(2)} | \`${(m.af || 'none').slice(0, 40)}…\` |`,
    );
  }
  lines.push(
    '',
    '## Objective prosody proxy (NOT CMOS)',
    '',
    'Automated relative proxy only. **Does not certify Gate 2.**',
    '',
  );
  if (summary) {
    lines.push('```json', JSON.stringify(summary, null, 2), '```', '');
    const mean = summary.meanProxyExpressiveVsPiper;
    lines.push(
      `**Status:** \`${summary.gateStatus || 'NOT_CERTIFIED_AWAITING_HUMAN_PANEL'}\``,
      '',
      `Proxy score (expressive vs Piper): **${mean}** (n=${summary.n}). Human CMOS not run.`,
      '',
      'This is **not** a PASS. Gate 2 requires `ui/eval-lab` human blind panel → `bench/eval/human-sessions/`.',
    );
  } else {
    lines.push('_No summary — scoring failed._');
  }
  lines.push(
    '',
    '## Honesty',
    '',
    '- Product-path audio is real product wiring (not offline directed-final DSP alone).',
    '- Proxy is **not** MOS/CMOS; absolute F0 band rewards were removed as circular.',
    '- Offline directed-final "+1.0 PASS" is **INVALID — post-hoc DSP**.',
    '- Run `node scripts/adversarial-proxy-sanity.js` and `node scripts/gate2-status.js`.',
    '',
  );
  const p = path.join(EVAL_DIR, 'gate2-product-path-report.md');
  fs.writeFileSync(p, lines.join('\n'));
  console.error(`wrote ${p}`);
  return p;
}

function main() {
  const skipRender = process.argv.includes('--skip-render');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(EVAL_DIR, { recursive: true });

  // Ensure dist is fresh enough
  if (!skipRender) {
    console.error('[build] nest build…');
    const b = spawnSync('npm', ['run', 'build'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 180_000,
    });
    if (b.status !== 0) {
      console.error(b.stderr || b.stdout);
      throw new Error('build failed');
    }
  }

  const mod = loadProductModules();
  const metas = [];

  if (!skipRender) {
    for (const f of FIXTURES) {
      try {
        metas.push(renderOne(mod, f));
      } catch (e) {
        console.error(`[render FAIL] ${f}: ${e.message}`);
        metas.push({
          fixture: f,
          error: e.message,
          affect: 'error',
          exaggeration: 0,
          af: null,
        });
      }
    }
    fs.writeFileSync(
      path.join(OUT_DIR, 'render-summary.json'),
      JSON.stringify({ at: new Date().toISOString(), metas }, null, 2),
    );
  } else {
    for (const f of FIXTURES) {
      const mp = path.join(OUT_DIR, `${f}.expression.json`);
      if (fs.existsSync(mp)) metas.push(JSON.parse(fs.readFileSync(mp, 'utf8')));
    }
  }

  const rendered = FIXTURES.filter((f) =>
    fs.existsSync(path.join(OUT_DIR, `${f}.wav`)),
  );
  if (rendered.length < 4) {
    console.error(
      `[warn] only ${rendered.length}/4 product-path WAVs present: ${rendered.join(',')}`,
    );
  }

  const summary = runBlindGateProduct();
  writeReport(summary, metas);

  // Never exit 2 for proxy "fail" — proxy does not certify. Human panel is separate.
  console.log(
    JSON.stringify(
      {
        ok: true,
        certified: false,
        gateStatus:
          (summary && summary.gateStatus) ||
          'NOT_CERTIFIED_AWAITING_HUMAN_PANEL',
        meanProxy: summary && summary.meanProxyExpressiveVsPiper,
        n: summary && summary.n,
        outDir: OUT_DIR,
        note: 'Product-path render diagnostic only; human CMOS not run',
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
