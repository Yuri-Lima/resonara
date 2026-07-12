#!/usr/bin/env node
/**
 * Local diagnostics bundle for bug reports (no secrets, no telemetry).
 * Usage: node scripts/diagnostics-bundle.js [--out path.zip]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const outArg = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : path.join(ROOT, 'demo-output', `resonara-diagnostics-${Date.now()}.zip`);

function safe(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
  } catch (e) {
    return `(failed: ${e.message})`;
  }
}

function redact(obj) {
  const s = JSON.stringify(obj, null, 2);
  return s.replace(/(api[_-]?key|secret|token|password|authorization)["']?\s*[:=]\s*["'][^"']+/gi, '$1":"***"');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'resonara-diag-'));
const versions = {
  at: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  package: (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    } catch {
      return null;
    }
  })(),
  git: safe('git rev-parse HEAD').trim(),
  ffmpeg: safe('ffmpeg -version').split('\n')[0],
  piper: fs.existsSync(path.join(ROOT, 'tools/piper-venv/bin/piper')) ? 'present' : 'missing',
  kokoro: fs.existsSync(path.join(ROOT, 'tools/kokoro-venv/bin/python')) ? 'present' : 'missing',
  whisper: fs.existsSync(path.join(ROOT, 'tools/whisper-venv/bin/python')) ? 'present' : 'missing',
};

fs.writeFileSync(path.join(tmp, 'versions.json'), redact(versions));
fs.writeFileSync(
  path.join(tmp, 'env-safe.json'),
  redact({
    RESONARA_LITE: process.env.RESONARA_LITE || null,
    RESONARA_DESKTOP: process.env.RESONARA_DESKTOP || null,

    PORT: process.env.PORT || null,
    // paths only, not secrets
    PIPER_PATH: process.env.PIPER_PATH || null,
    PIPER_MODELS_DIR: process.env.PIPER_MODELS_DIR || null,
  }),
);

// Recent log tails if present
for (const log of ['.resonara-ui.log', 'reports/probes/server-3848.log']) {
  const p = path.join(ROOT, log);
  if (fs.existsSync(p)) {
    const body = fs.readFileSync(p, 'utf8').slice(-50000);
    fs.writeFileSync(path.join(tmp, path.basename(log)), body);
  }
}

// FEATURE_TRUTH summary if present
const ft = path.join(ROOT, 'FEATURE_TRUTH.md');
if (fs.existsSync(ft)) {
  fs.copyFileSync(ft, path.join(tmp, 'FEATURE_TRUTH.md'));
}

const AdmZip = require('adm-zip');
const zip = new AdmZip();
for (const name of fs.readdirSync(tmp)) {
  zip.addLocalFile(path.join(tmp, name));
}
fs.mkdirSync(path.dirname(outArg), { recursive: true });
zip.writeZip(outArg);
console.log(JSON.stringify({ ok: true, path: outArg, files: fs.readdirSync(tmp) }, null, 2));
