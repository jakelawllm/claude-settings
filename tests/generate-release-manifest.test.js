#!/usr/bin/env node
/**
 * Tests for scripts/generate-release-manifest.py.
 *
 *   node tests/generate-release-manifest.test.js
 *
 * Flat script-style test file under tests/, not a framework suite.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'generate-release-manifest.py');
const REPO_ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'grm-'));
const OUT = path.join(TMP, 'release-manifest.json');
const PROD = path.join(REPO_ROOT, 'test-fixtures', 'synthetic-production.json');
const SANDBOX = path.join(REPO_ROOT, 'test-fixtures', 'synthetic-sandbox-policy.json');

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} want=${String(want).padEnd(6)} got=${got}`
  );
}

function run(args) {
  const r = spawnSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const create = run([
  '--output', OUT,
  '--production-settings', PROD,
  '--sandbox-policy', SANDBOX,
  '--allow-dirty',
]);
check('01 manifest generation exits 0', create.code, 0);
check('02 manifest file is written', fs.existsSync(OUT), true);

const manifest = JSON.parse(fs.readFileSync(OUT, 'utf8'));
check('03 manifest records full commit SHA', /^[a-f0-9]{40}$/.test(manifest.commit_sha), true);
check('04 manifest records production settings hash', /^[a-f0-9]{64}$/.test(manifest.production_settings_hash), true);
check('05 manifest records sandbox policy hash', /^[a-f0-9]{64}$/.test(manifest.sandbox_policy_hash), true);
check('06 manifest records minimum version', manifest.minimum_version, '2.1.219');
check('07 manifest records maximum version', manifest.maximum_version, '2.1.300');
check('08 manifest records tree state', /^(clean|dirty)$/.test(manifest.tree_state), true);

const verify = run([
  '--verify',
  '--output', OUT,
  '--production-settings', PROD,
  '--sandbox-policy', SANDBOX,
  '--allow-dirty',
]);
check('09 manifest verify exits 0', verify.code, 0);
check('10 manifest verify reports hash match', verify.stdout.includes('OK: manifest hashes match current artefacts'), true);

const tampered = { ...manifest, sandbox_policy_hash: '0'.repeat(64) };
const tamperedOut = path.join(TMP, 'tampered-manifest.json');
fs.writeFileSync(tamperedOut, JSON.stringify(tampered, null, 2) + '\n');
const bad = run([
  '--verify',
  '--output', tamperedOut,
  '--production-settings', PROD,
  '--sandbox-policy', SANDBOX,
  '--allow-dirty',
]);
check('11 manifest verify rejects tampered hash', bad.code, 1);
check('12 manifest verify reports sandbox mismatch', bad.stdout.includes('sandbox_policy_hash mismatch'), true);

const missingSandbox = run([
  '--output', path.join(TMP, 'missing-sandbox.json'),
  '--production-settings', PROD,
  '--allow-dirty',
]);
check('13 manifest requires sandbox policy argument', missingSandbox.code, 2);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail ? 1 : 0);
