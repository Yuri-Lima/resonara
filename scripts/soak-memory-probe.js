#!/usr/bin/env node
/**
 * Sample RSS of a PID (or farm lite server) into farm-output/soak/memory-curve.json
 * Usage: node scripts/soak-memory-probe.js --pid <pid> --interval-ms 5000 --out farm-output/soak/memory-curve.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
let pid = null, intervalMs = 5000, out = path.join(__dirname, '..', 'farm-output/soak/memory-curve.json');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pid') pid = Number(args[++i]);
  else if (args[i] === '--interval-ms') intervalMs = Number(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--until-file') { /* optional */ }
}

function sample(pid) {
  try {
    // macOS: ps rss is in KB
    const line = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf8' }).trim();
    const rssKB = parseInt(line, 10);
    let handles = null;
    try {
      handles = parseInt(execSync(`lsof -p ${pid} 2>/dev/null | wc -l`, { encoding: 'utf8' }).trim(), 10);
    } catch { /* */ }
    return {
      t: new Date().toISOString(),
      pid,
      rssKB,
      rssMB: rssKB / 1024,
      handles,
    };
  } catch {
    return null;
  }
}

function isPlateau(samples) {
  if (samples.length < 6) return false;
  const last = samples.slice(-6).map((s) => s.rssMB);
  const first = last[0];
  const max = Math.max(...last);
  const min = Math.min(...last);
  // plateau if range < 15% of first and not strictly increasing
  const range = max - min;
  let mono = true;
  for (let i = 1; i < last.length; i++) if (last[i] < last[i - 1]) mono = false;
  return range <= Math.max(20, first * 0.15) && !mono;
}

fs.mkdirSync(path.dirname(out), { recursive: true });
const curve = { samples: [], plateau: false, startedAt: new Date().toISOString() };

if (!pid) {
  // try lite server pid
  try {
    pid = parseInt(fs.readFileSync(path.join(__dirname, '..', 'farm-output/lite-server.pid'), 'utf8'), 10);
  } catch {
    console.error('need --pid');
    process.exit(1);
  }
}

console.log(JSON.stringify({ event: 'probe-start', pid, intervalMs, out }));
const timer = setInterval(() => {
  const s = sample(pid);
  if (!s) {
    curve.completedAt = new Date().toISOString();
    curve.plateau = isPlateau(curve.samples);
    fs.writeFileSync(out, JSON.stringify(curve, null, 2) + '\n');
    console.log(JSON.stringify({ event: 'probe-end', reason: 'pid-gone', samples: curve.samples.length, plateau: curve.plateau }));
    clearInterval(timer);
    process.exit(0);
  }
  curve.samples.push(s);
  curve.plateau = isPlateau(curve.samples);
  fs.writeFileSync(out, JSON.stringify(curve, null, 2) + '\n');
  console.log(JSON.stringify({ event: 'sample', rssMB: s.rssMB.toFixed(1), handles: s.handles, n: curve.samples.length }));
}, intervalMs);

process.on('SIGTERM', () => {
  curve.completedAt = new Date().toISOString();
  curve.plateau = isPlateau(curve.samples);
  fs.writeFileSync(out, JSON.stringify(curve, null, 2) + '\n');
  process.exit(0);
});
