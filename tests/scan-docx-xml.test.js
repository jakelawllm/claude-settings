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
// macOS's system temp prefix may itself be a trusted /var -> /private/var alias.
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdx-')));

let pass = 0;
let fail = 0;
let skipped = 0;

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

function makeDocx(name, xml, fileName = 'word/document.xml') {
  const fileNameBuf = Buffer.from(fileName, 'utf8');
  const content = Buffer.isBuffer(xml) ? xml : Buffer.from(`<root xmlns:w="urn:test">${xml}</root>`, 'utf8');
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
  const r = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [SCRIPT, file], { encoding: 'utf8' });
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

const token = 'ghp_' + 'a'.repeat(30);
for (const [name, xml, label] of [
  ['split-runs', `<w:t>${token.slice(0, 12)}</w:t><w:t>${token.slice(12)}</w:t>`, 'GitHub token'],
  ['escaped-assignment', '<w:t>password=&quot;super-secret-value&quot;</w:t>', 'Generic assignment'],
  ['domain-in-secret', '<w:t>password="secret-example.invalid-value"</w:t>', 'Generic assignment'],
  ['attribute', `<item target="${token}"/>`, 'GitHub token'],
  ['utf16', Buffer.from(`<?xml version="1.0" encoding="utf-16"?><root>${token}</root>`, 'utf16le'), 'GitHub token'],
]) {
  const result = run(makeDocx(name + '.docx', xml));
  check(`${name} is rejected`, result.code, 1);
  check(`${name} reports the matching rule`, result.stdout.includes(label), true);
  check(`${name} findings never print values`, result.stdout.includes(token) || result.stdout.includes('super-secret'), false);
}
const sensitiveName = makeDocx(token + '.docx', `<w:t>${token}</w:t>`, token + '.xml');
const named = run(sensitiveName);
check('credential in document and member names is redacted', named.stdout.includes(token), false);
check('named member still fails', named.code, 1);

for (const [name, xml] of [
  ['malformed', Buffer.from('<broken>')],
  ['unsupported-encoding', Buffer.from('<?xml version="1.0" encoding="unknown-encoding"?><root/>')],
  ['entity', Buffer.from('<!DOCTYPE root [<!ENTITY x "text">]><root>&x;</root>')],
  ['oversized', '<w:t>' + 'a'.repeat(16 * 1024 * 1024) + '</w:t>'],
]) {
  check(`${name} fails closed`, run(makeDocx(name + '.docx', xml)).code, 1);
}
check('missing explicit input fails', run(path.join(TMP, 'missing.docx')).code, 2);
const badType = path.join(TMP, 'not-office.txt');
fs.writeFileSync(badType, 'text');
check('non-Office explicit input fails', run(badType).code, 2);

const historyDir = path.join(TMP, 'history');
fs.mkdirSync(historyDir);
function git(args) {
  const r = spawnSync('git', args, { cwd: historyDir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('synthetic git fixture failed');
}
git(['init', '-q']);
git(['config', 'user.email', 'test@example.invalid']);
git(['config', 'user.name', 'Test']);
git(['config', 'commit.gpgsign', 'false']);
const historicDoc = path.join(historyDir, 'policy.docx');
fs.copyFileSync(secretBesideAllowed, historicDoc);
git(['add', '.']);
git(['commit', '-qm', 'synthetic initial document']);
fs.copyFileSync(allowedOnly, historicDoc);
git(['add', '.']);
git(['commit', '-qm', 'synthetic cleaned document']);
const historic = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [SCRIPT, '--history'], { cwd: historyDir, encoding: 'utf8' });
check('removed Office secrets are found in history', historic.status, 1);
check('historical findings identify the blob', historic.stdout.includes('blob-'), true);
check('historical findings are redacted', historic.stdout.includes('super-secret-value'), false);

// Pending Office documents must be checked independently in the index and worktree.
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
function fixture(name) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir);
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  if (init.status !== 0) throw new Error('synthetic Git initialization failed');
  return dir;
}
function gitAt(dir, args, input) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', input });
  if (result.status !== 0) throw new Error('synthetic Git index setup failed');
  return result.stdout.trim();
}
function worktree(dir, extra = []) {
  return spawnSync(PYTHON, [SCRIPT, '--worktree', ...extra], { cwd: dir, encoding: 'utf8' });
}
function copyDoc(dir, name, source = secretBesideAllowed) {
  const target = path.join(dir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return target;
}

const stagedDir = fixture('staged');
const stagedFile = copyDoc(stagedDir, 'staged.docx');
gitAt(stagedDir, ['add', '--', 'staged.docx']);
fs.unlinkSync(stagedFile);
const deletedStage = worktree(stagedDir);
check('staged Office secret survives working-copy deletion', deletedStage.status, 1);
check('deleted working copy is scanned through index blob', deletedStage.stdout.includes('staged-blob-'), true);
check('staged secret output is redacted', deletedStage.stdout.includes('super-secret-value'), false);
fs.copyFileSync(allowedOnly, stagedFile);
const cleanedStage = worktree(stagedDir);
check('clean working copy cannot hide staged Office secret', cleanedStage.status, 1);
check('cleaned working copy still reports staged blob', cleanedStage.stdout.includes('staged-blob-'), true);

const untrackedDir = fixture('untracked');
copyDoc(untrackedDir, 'new.xlsx');
check('nonignored new Office files are included', worktree(untrackedDir).status, 1);

const ignoredDir = fixture('ignored');
fs.writeFileSync(path.join(ignoredDir, '.gitignore'), '.claude-orch/\nignored.docx\n');
copyDoc(ignoredDir, '.claude-orch/deep/runtime.docx');
// Audit hook proves the Python scanner never opens or traverses ignored runtime paths.
const ignoredAudit = spawnSync(PYTHON, ['-c', [
  'import os,runpy,sys',
  'blocked=os.path.normcase(os.path.abspath(".claude-orch"))',
  'def audit(event,args):',
  ' if event in ("open","os.scandir") and args and isinstance(args[0],(str,bytes)):',
  '  name=os.path.normcase(os.path.abspath(os.fsdecode(args[0])))',
  '  if name==blocked or name.startswith(blocked+os.sep): raise RuntimeError("ignored runtime accessed")',
  'sys.addaudithook(audit)',
  'sys.argv=[sys.argv[1],"--worktree"]',
  'runpy.run_path(sys.argv[0],run_name="__main__")',
].join('\n'), SCRIPT], { cwd: ignoredDir, encoding: 'utf8' });
check('ignored runtime Office files are never opened/traversed', ignoredAudit.status, 0);
const defaultIgnored = spawnSync(PYTHON, [SCRIPT], { cwd: ignoredDir, encoding: 'utf8' });
check('default repository scan also excludes ignored runtime', defaultIgnored.status, 0);
copyDoc(ignoredDir, 'ignored.docx', allowedOnly);
gitAt(ignoredDir, ['add', '-f', '--', 'ignored.docx']);
copyDoc(ignoredDir, 'ignored.docx');
const trackedIgnored = worktree(ignoredDir);
check('tracked files matching ignore rules remain scanned', trackedIgnored.status, 1);
check('tracked ignored working-copy change is reported', trackedIgnored.stdout.includes('ignored.docx:'), true);

const namedDir = fixture('hostile-name');
copyDoc(namedDir, token + '.docx');
const namedWorktree = worktree(namedDir);
check('hostile worktree filename remains a detected finding', namedWorktree.status, 1);
check('worktree filename and diagnostic redact credentials', (namedWorktree.stdout + namedWorktree.stderr).includes(token), false);

const conflictDir = fixture('conflict');
copyDoc(conflictDir, 'conflicted.docx', allowedOnly);
const conflictOid = gitAt(conflictDir, ['hash-object', '-w', '--', 'conflicted.docx']);
gitAt(conflictDir, ['update-index', '--index-info'],
  `100644 ${conflictOid} 1\tconflicted.docx\n100644 ${conflictOid} 2\tconflicted.docx\n`);
check('unresolved index conflicts fail closed', worktree(conflictDir).status, 1);

const missingBlobDir = fixture('missing-blob');
copyDoc(missingBlobDir, 'missing-blob.docx', allowedOnly);
gitAt(missingBlobDir, ['add', '--', 'missing-blob.docx']);
const missingOid = gitAt(missingBlobDir, ['rev-parse', ':missing-blob.docx']);
fs.unlinkSync(path.join(missingBlobDir, '.git', 'objects', missingOid.slice(0, 2), missingOid.slice(2)));
check('unreadable staged Office blob fails closed', worktree(missingBlobDir).status, 1);

const badGitDir = path.join(TMP, 'not-a-repository-' + token);
fs.mkdirSync(badGitDir);
const badGit = worktree(badGitDir);
check('Git enumeration failure cannot become a clean scan', badGit.status, 1);
check('Git failure redacts filenames and stderr', (badGit.stdout + badGit.stderr).includes(token), false);
check('Git failure has a useful fixed diagnostic', badGit.stdout.includes('could not completely enumerate'), true);

const unreadable = spawnSync(PYTHON, ['-c', [
  'import importlib.util,sys',
  'spec=importlib.util.spec_from_file_location("office_scan",sys.argv[1])',
  'm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)',
  'def denied(path): raise PermissionError("credential-in-os-error")',
  'm.read_office_payload=denied',
  'sys.exit(m.main(["--worktree"]))',
].join('\n'), SCRIPT], { cwd: untrackedDir, encoding: 'utf8' });
check('unreadable pending document fails closed', unreadable.status, 1);
check('filesystem exception contents are never printed', (unreadable.stdout + unreadable.stderr).includes('credential-in-os-error'), false);

const linkDir = fixture('symlink');
try {
  fs.symlinkSync(secretBesideAllowed, path.join(linkDir, 'outside.docx'), 'file');
  const linked = worktree(linkDir);
  check('outside Office symlink fails closed', linked.status, 1);
  check('outside Office symlink payload is not read', linked.stdout.includes('Generic assignment'), false);
  check('explicit Office symlink is refused', run(path.join(linkDir, 'outside.docx')).code, 2);
  const parentDir = fixture('parent-symlink');
  copyDoc(parentDir, 'documents/clean.docx', allowedOnly);
  gitAt(parentDir, ['add', '--', 'documents/clean.docx']);
  fs.unlinkSync(path.join(parentDir, 'documents', 'clean.docx'));
  fs.rmdirSync(path.join(parentDir, 'documents'));
  fs.symlinkSync(TMP, path.join(parentDir, 'documents'), process.platform === 'win32' ? 'junction' : 'dir');
  const parentLink = worktree(parentDir);
  check('symlink parent is refused before target traversal', parentLink.status, 1);
} catch (error) {
  if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  skipped++;
  console.log('SKIP  real symlink creation unavailable to this Windows test account');
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\npassed=${pass} failed=${fail} skipped=${skipped}`);
process.exit(fail ? 1 : 0);
