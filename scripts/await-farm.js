#!/usr/bin/env node
/**
 * Farm sign-off gate (ops runbook: docs/farm-ops-notes.md).
 * Polls state.json every 5s and exits 0 when state.status === 'FARM DONE'.
 *
 * Usage:
 *   node scripts/await-farm.js [--state farm-output/state.json] [--timeout-ms 60000]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    state: path.join(ROOT, 'farm-output/state.json'),
    timeoutMs: Number(process.env.AWAIT_FARM_TIMEOUT_MS || 0), // 0 = no timeout
    // Phase 9 fix: accept COMPLETE as success (orchestrator vocabulary)
    // BEFORE fix: only 'FARM DONE'. AFTER: COMPLETE and FARM DONE.
    accept: process.env.AWAIT_FARM_ACCEPT
      ? process.env.AWAIT_FARM_ACCEPT.split(',')
      : null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state') opts.state = path.resolve(argv[++i]);
    else if (argv[i] === '--timeout-ms') opts.timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--accept') opts.accept = argv[++i].split(',');
  }
  // Default accept list: after Phase 9 fix includes COMPLETE
  if (!opts.accept) {
    // FIXED gate (Phase 9): orchestrator writes COMPLETE
    opts.accept = ['FARM DONE', 'COMPLETE'];
  }
  return opts;
}

function readStatus(statePath) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return s.status || null;
  } catch (e) {
    return null;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  console.log(
    JSON.stringify({
      event: 'await-farm-start',
      state: opts.state,
      accept: opts.accept,
      timeoutMs: opts.timeoutMs,
    }),
  );

  const tick = () => {
    const status = readStatus(opts.state);
    if (status && opts.accept.includes(status)) {
      console.log(
        JSON.stringify({
          event: 'await-farm-ok',
          status,
          elapsedMs: Date.now() - started,
        }),
      );
      process.exit(0);
    }
    if (opts.timeoutMs > 0 && Date.now() - started > opts.timeoutMs) {
      console.error(
        JSON.stringify({
          event: 'await-farm-timeout',
          status,
          accept: opts.accept,
          elapsedMs: Date.now() - started,
        }),
      );
      process.exit(1);
    }
  };

  tick();
  setInterval(tick, 5000);
}

module.exports = { parseArgs, readStatus };

if (require.main === module) {
  main();
}
