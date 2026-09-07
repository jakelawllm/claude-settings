/**
 * Validate the actual JSON example in docs/records-schema.md.
 *
 *   node tests/records-schema.test.js
 *
 * This is documentation validation only. No records service, registry lookup,
 * transcript digest verification, duplicate detection or handoff runs here.
 * Executable archive behavior is exercised by tests/matter-guard.test.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'records-schema.md'), 'utf8');
const exampleBlock = doc.match(/```json\s*\n([\s\S]*?)\n```/);
if (!exampleBlock) throw new Error('records-schema.md has no JSON example');
const record = JSON.parse(exampleBlock[1]);
let pass = 0;
let fail = 0;
function check(label, condition) {
  condition ? pass++ : fail++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
}
const required = [
  'version', 'matter_id', 'session_id', 'timestamp_start', 'timestamp_end',
  'hook_hash', 'settings_hash', 'policy_hash', 'transcript_hash',
  'transcript_size_bytes', 'transcript_path',
];
check('published JSON example has every required field', required.every((field) => Object.hasOwn(record, field)));
check('field table documents every required field', required.every((field) => doc.includes('`' + field + '`')));
check('schema distinguishes repository and external storage', /repository owns the naming rules.*does not own production storage/is.test(doc));
check('corrupt binding must not fall back to cwd', /must not silently file.*based only on cwd/is.test(doc));
check('published example uses supported version', record.version === '1.0');
check('published example uses a qualified matter identity', typeof record.matter_id === 'string' && /^matter:\/.+/.test(record.matter_id));
check('all published example hashes have the stated format', ['session_id', 'hook_hash', 'settings_hash', 'policy_hash', 'transcript_hash']
  .every((key) => typeof record[key] === 'string' && /^[a-f0-9]{64}$/.test(record[key])));
function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.toISOString() === value.replace(/(?<!\.\d{3})Z$/, '.000Z');
}
check('published timestamps are real UTC ISO instants', utcInstant(record.timestamp_start) && utcInstant(record.timestamp_end));
check('published timestamps are ordered', Date.parse(record.timestamp_start) < Date.parse(record.timestamp_end));
check('published size is within the stated range', Number.isInteger(record.transcript_size_bytes) && record.transcript_size_bytes > 0 && record.transcript_size_bytes <= 100000000);
check('published transcript path is absolute and contains no parent segment', typeof record.transcript_path === 'string' && record.transcript_path.startsWith('/') && !record.transcript_path.split('/').includes('..') && !record.transcript_path.includes('\0'));
check('published transcript path uses the JSONL suffix', record.transcript_path.endsWith('.jsonl'));
console.log(`\npassed=${pass} failed=${fail} (documentation example only; external service not exercised)`);
process.exit(fail ? 1 : 0);
