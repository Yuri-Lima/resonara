#!/usr/bin/env node
/**
 * PRE-FIX sign-off gate (runbook literal): only accepts status === 'FARM DONE'.
 * The orchestrator writes 'COMPLETE', so this gate NEVER fires.
 * Kept for Phase 9 before/after evidence.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const statePath = process.argv[2] || path.join(__dirname, '..', 'farm-output/state.json');
const timeoutMs = Number(process.argv[3] || 15000);
const started = Date.now();
console.log(JSON.stringify({ event: 'buggy-await-start', accept: 'FARM DONE', statePath, timeoutMs }));
const t = setInterval(() => {
  let status = null;
  try { status = JSON.parse(fs.readFileSync(statePath, 'utf8')).status; } catch {}
  if (status === 'FARM DONE') {
    console.log(JSON.stringify({ event: 'buggy-await-ok', status }));
    process.exit(0);
  }
  if (Date.now() - started > timeoutMs) {
    console.error(JSON.stringify({ event: 'buggy-await-would-hang', status, note: 'runbook waits for FARM DONE; orchestrator writes COMPLETE' }));
    process.exit(2);
  }
}, 5000);
// immediate check
try {
  const status = JSON.parse(fs.readFileSync(statePath, 'utf8')).status;
  if (status === 'FARM DONE') { console.log(JSON.stringify({ event: 'buggy-await-ok', status })); process.exit(0); }
  console.log(JSON.stringify({ event: 'buggy-await-poll', status }));
} catch (e) {
  console.log(JSON.stringify({ event: 'buggy-await-poll', status: null }));
}
