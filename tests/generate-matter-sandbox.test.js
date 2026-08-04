#!/usr/bin/env node
/**
 * Tests for scripts/generate-matter-sandbox.py.
 *
 *   node tests/generate-matter-sandbox.test.js
 *
 * The generator is driven as a child process with real JSON inputs.
 * Tests cover happy path and all documented refusal cases.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GENERATOR = process.argv[2] || path.join(__dirname, '..', 'scripts', 'generate-matter-sandbox.py');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-'));
const MATTER_DEF = path.join(TMP, 'matter.json');
const OUTPUT = path.join(TMP, 'sandbox-policy.json');

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} want=${String(want).padEnd(6)} got=${got}`
  );
}

function run(args, input) {
  const cmd = [GENERATOR, ...args];
  const r = spawnSync('python3', cmd, {
    input: input !== undefined ? input : undefined,
    encoding: 'utf8',
    cwd: TMP,
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function writeMatter(def) {
  fs.writeFileSync(MATTER_DEF, JSON.stringify(def, null, 2));
}

// Happy path: valid matter definition produces valid sandbox policy
writeMatter({
  matter_id: 'matter-2026-0142',
  name: 'Smith',
  root: '/srv/matters/Smith',
  aliases: [],
  allowed_tooling_paths: ['/usr/bin', '/opt/claude'],
  allowed_domains: ['api.anthropic.com'],
  record_root: null,
});

let r = run(['--matter-definition', MATTER_DEF, '--output', OUTPUT]);
check('happy path exits 0', r.code, 0);
check('happy path wrote output', fs.existsSync(OUTPUT), true);

if (fs.existsSync(OUTPUT)) {
  const policy = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  check('policy has sandbox.enabled true', policy.sandbox.enabled, true);
  check('policy has failIfUnavailable true', policy.sandbox.failIfUnavailable, true);
  check('policy has allowManagedReadPathsOnly true', policy.sandbox.filesystem.allowManagedReadPathsOnly, true);
  check('policy has allowManagedDomainsOnly true', policy.sandbox.network.allowManagedDomainsOnly, true);
  check('policy has denyRead root', policy.sandbox.filesystem.denyRead.includes('/'), true);
  check('policy has allowRead matter root', policy.sandbox.filesystem.allowRead.includes('/srv/matters/Smith'), true);
  check('policy has credential deny files', policy.sandbox.credentials.files.length > 0, true);
  check('policy has credential deny envVars', policy.sandbox.credentials.envVars.length > 0, true);
}

// Refusal: relative root
writeMatter({
  matter_id: 'matter-2026-0142',
  name: 'Smith',
  root: 'relative/path',
  aliases: [],
  allowed_tooling_paths: ['/usr/bin'],
  allowed_domains: ['api.anthropic.com'],
  record_root: null,
});

r = run(['--matter-definition', MATTER_DEF, '--output', path.join(TMP, 'out1.json')]);
check('relative root exits non-zero', r.code !== 0, true);
check('relative root error mentions absolute', r.stderr.includes('absolute'), true);

// Refusal: placeholder in root
writeMatter({
  matter_id: 'matter-2026-0142',
  name: 'Smith',
  root: '/srv/matters/REPLACE-WITH-NAME',
  aliases: [],
  allowed_tooling_paths: ['/usr/bin'],
  allowed_domains: ['api.anthropic.com'],
  record_root: null,
});

r = run(['--matter-definition', MATTER_DEF, '--output', path.join(TMP, 'out2.json')]);
check('placeholder root exits non-zero', r.code !== 0, true);
check('placeholder root error mentions placeholder', r.stderr.includes('placeholder'), true);

// Refusal: native Windows path
writeMatter({
  matter_id: 'matter-2026-0142',
  name: 'Smith',
  root: 'C:\\\\srv\\\\matters\\\\Smith',
  aliases: [],
  allowed_tooling_paths: ['/usr/bin'],
  allowed_domains: ['api.anthropic.com'],
  record_root: null,
});

r = run(['--matter-definition', MATTER_DEF, '--output', path.join(TMP, 'out3.json')]);
check('Windows root exits non-zero', r.code !== 0, true);
check('Windows root error mentions Windows', r.stderr.includes('Windows'), true);

// Refusal: alias outside root
writeMatter({
  matter_id: 'matter-2026-0142',
  name: 'Smith',
  root: '/srv/matters/Smith',
  aliases: ['/srv/matters/Jones'],
  allowed_tooling_paths: ['/usr/bin'],
  allowed_domains: ['api.anthropic.com'],
  record_root: null,
});

r = run(['--matter-definition', MATTER_DEF, '--output', path.join(TMP, 'out4.json')]);
check('alias outside root exits non-zero', r.code !== 0, true);
check('alias error mentions outside', r.stderr.includes('outside'), true);

// Refusal: missing required field
writeMatter({
  matter_id: 'matter-2026-0142',
  name: 'Smith',
  // missing root
  aliases: [],
  allowed_tooling_paths: ['/usr/bin'],
  allowed_domains: ['api.anthropic.com'],
  record_root: null,
});

r = run(['--matter-definition', MATTER_DEF, '--output', path.join(TMP, 'out5.json')]);
check('missing field exits non-zero', r.code !== 0, true);
check('missing field error mentions root', r.stderr.includes('root'), true);

// Refusal: overlapping roots
writeMatter({
  matter_id: 'matter-2026-0142',
  name: 'Smith',
  root: '/srv/matters/Smith',
  aliases: [],
  allowed_tooling_paths: ['/usr/bin'],
  allowed_domains: ['api.anthropic.com'],
  record_root: null,
});

r = run(['--matter-definition', MATTER_DEF, '--output', path.join(TMP, 'out6.json'), '--other-roots', '/srv/matters/Smith']);
check('overlapping root exits non-zero', r.code !== 0, true);
check('overlap error mentions identical', r.stderr.includes('identical'), true);

// Refusal: invalid JSON
r = run(['--matter-definition', path.join(TMP, 'nonexistent.json'), '--output', path.join(TMP, 'out7.json')]);
check('missing file exits non-zero', r.code !== 0, true);

console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail ? 1 : 0);
