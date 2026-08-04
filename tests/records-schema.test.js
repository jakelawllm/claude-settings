/**
 * Tests for docs/records-schema.md.
 *
 *   node tests/records-schema.test.js
 *
 * The production records service is external. This test pins the validation
 * contract the repository publishes, so future edits cannot weaken it silently.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DOC = path.join(__dirname, '..', 'docs', 'records-schema.md');
const doc = fs.readFileSync(DOC, 'utf8');

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} want=${String(want).padEnd(6)} got=${got}`
  );
}

function validRecord(overrides) {
  const hash = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
  return {
    version: '1.0',
    matter_id: 'matter:/matters/clients/Smith',
    session_id: hash,
    timestamp_start: '2026-08-03T14:00:00Z',
    timestamp_end: '2026-08-03T14:30:00Z',
    hook_hash: hash,
    settings_hash: hash,
    policy_hash: hash,
    transcript_hash: hash,
    transcript_size_bytes: 54321,
    transcript_path: '/matters/clients/Smith/_ai-record/session-2026-08-03T14-00-00-aabbccdd.jsonl',
    ...(overrides || {}),
  };
}

function validateRecord(record) {
  const errors = [];
  const required = [
    'version', 'matter_id', 'session_id', 'timestamp_start', 'timestamp_end',
    'hook_hash', 'settings_hash', 'policy_hash', 'transcript_hash',
    'transcript_size_bytes', 'transcript_path',
  ];
  for (const key of required) {
    if (record[key] === undefined || record[key] === null || record[key] === '') errors.push(`missing ${key}`);
  }
  if (record.version !== '1.0') errors.push('bad version');
  if (!/^matter:\/.+/.test(record.matter_id || '')) errors.push('bad matter_id');
  for (const key of ['session_id', 'hook_hash', 'settings_hash', 'policy_hash', 'transcript_hash']) {
    if (!/^[a-f0-9]{64}$/.test(record[key] || '')) errors.push(`bad ${key}`);
  }
  const start = Date.parse(record.timestamp_start || '');
  const end = Date.parse(record.timestamp_end || '');
  if (!String(record.timestamp_start || '').endsWith('Z') || Number.isNaN(start)) errors.push('bad start');
  if (!String(record.timestamp_end || '').endsWith('Z') || Number.isNaN(end)) errors.push('bad end');
  if (!Number.isNaN(start) && !Number.isNaN(end) && !(start < end)) errors.push('timestamp order');
  if (!Number.isInteger(record.transcript_size_bytes) || record.transcript_size_bytes <= 0 || record.transcript_size_bytes > 100000000) errors.push('bad size');
  const parts = String(record.transcript_path || '').split('/');
  if (!String(record.transcript_path || '').startsWith('/')) errors.push('relative path');
  if (parts.includes('..')) errors.push('traversal path');
  if (!String(record.transcript_path || '').endsWith('.jsonl')) errors.push('bad suffix');
  return { valid: errors.length === 0, errors };
}

check('01 published schema names every required field', [
  'version', 'matter_id', 'session_id', 'timestamp_start', 'timestamp_end',
  'hook_hash', 'settings_hash', 'policy_hash', 'transcript_hash',
  'transcript_size_bytes', 'transcript_path',
].every((field) => doc.includes(`\`${field}\``) || doc.includes(`"${field}"`)), true);
check('02 published schema states repo/service boundary', /repository owns the naming rules.*does not own production storage/is.test(doc), true);
check('03 published schema rejects cwd inference on corrupt binding', /must not silently file.*based only on cwd/is.test(doc), true);
check('04 valid synthetic record passes validator', validateRecord(validRecord()).valid, true);
check('05 malformed hash rejects', validateRecord(validRecord({ session_id: 'not-a-hash' })).valid, false);
check('06 uppercase hash rejects', validateRecord(validRecord({ hook_hash: 'A'.repeat(64) })).valid, false);
check('07 timestamp end before start rejects', validateRecord(validRecord({ timestamp_start: '2026-08-03T15:00:00Z' })).valid, false);
check('08 traversal transcript path rejects', validateRecord(validRecord({ transcript_path: '/matters/Smith/../Jones/x.jsonl' })).valid, false);
check('09 relative transcript path rejects', validateRecord(validRecord({ transcript_path: 'Smith/_ai-record/x.jsonl' })).valid, false);
check('10 zero-size transcript rejects', validateRecord(validRecord({ transcript_size_bytes: 0 })).valid, false);

console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail ? 1 : 0);
