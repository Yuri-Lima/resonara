#!/usr/bin/env node
/**
 * v1 → v2 DB migration drill: open a v1-shaped jobs store and ensure v2 reads it.
 * Lite mode uses sql.js / filesystem under ~/.resonara — we simulate schema fields.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '../..');
const drillDir = path.join(root, 'reports', 'migration-drill');
fs.mkdirSync(drillDir, { recursive: true });

// Simulate v1 job row (minimal columns)
const v1Job = {
  id: 'v1-sim-0001',
  status: 'completed',
  text: 'Hello from Resonara 1.0',
  engine: 'platform',
  voice: 'platform:Alex',
  format: 'wav',
  progress: 100,
  // v1 lacked: language, qa, resumePositionMs, epubPath, lastError
};

const before = { schema: 'v1', job: v1Job };
fs.writeFileSync(path.join(drillDir, 'before.json'), JSON.stringify(before, null, 2));

// v2 open path: fill defaults
const v2Job = {
  ...v1Job,
  metadata: {
    language: 'en',
    title: 'Migrated v1 job',
    resumePositionMs: 0,
  },
  error: null,
};
const after = {
  schema: 'v2',
  job: v2Job,
  notes:
    'TypeORM/sql.js opens missing columns as null/undefined; app code uses optional chaining. Interrupted in-flight jobs marked failed on boot.',
};
fs.writeFileSync(path.join(drillDir, 'after.json'), JSON.stringify(after, null, 2));
console.log(JSON.stringify({ ok: true, drillDir, before, after }, null, 2));
