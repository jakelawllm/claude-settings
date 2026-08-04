#!/usr/bin/env node
/**
 * Tests for scripts/scan-docx-xml.py.
 *
 *   node tests/scan-docx-xml.test.js
 *
 * Flat script-style test file under tests/, not a framework suite.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'scan-docx-xml.py');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sdx-'));

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} want=${String(want).padEnd(6)} got=${got}`
  );
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

function makeDocx(name, xml) {
  const fileName = 'word/document.xml';
  const fileNameBuf = Buffer.from(fileName, 'utf8');
  const content = Buffer.from(xml, 'utf8');
  const compressed = zlib.deflateRawSync(content);
  const { time, date } = dosDateTime(new Date('2026-08-04T12:00:00Z'));
  const crc = crc32(content);

  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8), u16(time), u16(date),
    u32(crc), u32(compressed.length), u32(content.length), u16(fileNameBuf.length), u16(0), fileNameBuf,
  ]);
  const localOffset = 0;

  const centralHeader = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(time), u16(date),
    u32(crc), u32(compressed.length), u32(content.length), u16(fileNameBuf.length), u16(0), u16(0),
    u16(0), u16(0), u32(0), u32(localOffset), fileNameBuf,
  ]);
  const centralOffset = localHeader.length + compressed.length;

  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(1), u16(1),
    u32(centralHeader.length), u32(centralOffset), u16(0),
  ]);

  const out = path.join(TMP, name);
  fs.writeFileSync(out, Buffer.concat([localHeader, compressed, centralHeader, end]));
  return out;
}

function run(file) {
  const r = spawnSync('python3', [SCRIPT, file], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const allowedOnly = makeDocx('allowed.docx', '<w:t>synthetic endpoint https://safe.example.invalid</w:t>');
const t1 = run(allowedOnly);
check('01 scanner accepts allowed synthetic value', t1.code, 0);

const secretBesideAllowed = makeDocx(
  'secret-beside-allowed.docx',
  '<w:t>allowed https://safe.example.invalid and secret="super-secret-value"</w:t>'
);
const t2 = run(secretBesideAllowed);
check('02 scanner rejects secret beside allowed value', t2.code, 1);
check('03 scanner reports generic assignment', t2.stdout.includes('Generic assignment'), true);

const privateIpBesideAllowed = makeDocx(
  'private-ip-beside-allowed.docx',
  '<w:t>allowed https://safe.example.invalid and host 10.42.1.9</w:t>'
);
const t3 = run(privateIpBesideAllowed);
check('04 scanner rejects private IP beside allowed value', t3.code, 1);
check('05 scanner reports private IP', t3.stdout.includes('Private IPv4 (10.x.x.x)'), true);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail ? 1 : 0);
