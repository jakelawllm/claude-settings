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

const { copyEvidence } = require('./synthetic-evidence');

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
  const r = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [SCRIPT, '--claude-code-version', '2.1.263', ...args], { encoding: 'utf8' });
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
check('06 manifest records minimum version', manifest.minimum_version, '2.1.251');
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

for (const [field, value] of [['generated_at', 'not-a-dateZ'], ['generated_at', '2026-02-30T12:00:00Z'], ['tree_state', 'approved'], ['minimum_version', '2.1.251junk']]) {
  const candidate = path.join(TMP, 'invalid-shape.json');
  fs.writeFileSync(candidate, JSON.stringify({ ...manifest, [field]: value }));
  const result = run(['--verify', '--output', candidate, '--production-settings', PROD, '--sandbox-policy', SANDBOX, '--allow-dirty']);
  check(`manifest rejects invalid ${field} ${value}`, result.code, 1);
}
const mismatchedPolicy = path.join(TMP, 'mismatched-policy.json');
const changedPolicy = JSON.parse(fs.readFileSync(SANDBOX, 'utf8'));
changedPolicy.sandbox.network.allowedDomains.push('other.example.invalid');
fs.writeFileSync(mismatchedPolicy, JSON.stringify(changedPolicy));
const mismatch = run(['--output', OUT, '--production-settings', PROD, '--sandbox-policy', mismatchedPolicy, '--allow-dirty']);
check('manifest refuses policy differing from installed settings', mismatch.code, 1);
check('policy mismatch is named', mismatch.stdout.includes('does not match'), true);
check('failed generation preserves previous manifest', JSON.stringify(JSON.parse(fs.readFileSync(OUT, 'utf8'))) === JSON.stringify(manifest), true);
const copiedProd = path.join(TMP, 'copied-production.json');
fs.copyFileSync(PROD, copiedProd);
const inputBytes = fs.readFileSync(copiedProd, 'utf8');
check('manifest cannot overwrite input', run(['--output', copiedProd, '--production-settings', copiedProd, '--sandbox-policy', SANDBOX, '--allow-dirty']).code, 1);
check('manifest input remains unchanged', fs.readFileSync(copiedProd, 'utf8') === inputBytes, true);
check('unreviewed version outside range rejected', run(['--output', OUT, '--production-settings', PROD, '--sandbox-policy', SANDBOX, '--allow-dirty', '--claude-code-version', '2.1.301']).code, 1);

// Exercise the documented full static bundle workflow with a single matter.
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
// Simulate an actual install failure after the complete temporary file exists.
const atomicFailure = spawnSync(PYTHON, ['-c', `
import pathlib, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
from release_validation import atomic_write_json
target = pathlib.Path(sys.argv[2])
before = target.read_bytes()
with patch('release_validation.os.replace', side_effect=OSError('synthetic disk error')):
    try:
        atomic_write_json(target, {'new': 'bundle'})
    except OSError:
        pass
    else:
        raise AssertionError('write unexpectedly succeeded')
assert target.read_bytes() == before, 'previous manifest was truncated'
assert not list(target.parent.glob('.' + target.name + '.*.tmp')), 'temporary output leaked'
`, path.join(REPO_ROOT, 'scripts'), OUT], { encoding: 'utf8' });
check('atomic install failure preserves existing bundle and cleans temp file', atomicFailure.status, 0);
const definition = path.join(TMP, 'matter-definition.json');
const generatedPolicy = path.join(TMP, 'generated-policy.json');
const renderedSettings = path.join(TMP, 'rendered-settings.json');
const generatedManifest = path.join(TMP, 'generated-manifest.json');
const currentEvidence = path.join(TMP, 'current-evidence');
copyEvidence(currentEvidence);
fs.writeFileSync(definition, JSON.stringify({ matter_id: 'synthetic-1', name: 'Synthetic', root: '/synthetic-matters/Smith', aliases: [], allowed_tooling_paths: ['/usr/bin', '/opt/claude'], allowed_domains: ['api.anthropic.com'], record_root: null }));
function bundleScript(name, args) {
  return spawnSync(PYTHON, [path.join(REPO_ROOT, 'scripts', name), ...args], { encoding: 'utf8' });
}
check('bundle workflow generates matter policy', bundleScript('generate-matter-sandbox.py', ['--matter-definition', definition, '--output', generatedPolicy]).status, 0);
// Rendering can cross-build; host preflight is meaningful only on Linux/WSL2.
const installedHook = process.platform === 'win32' ? '/synthetic-hooks/matter-guard.js' : path.join(REPO_ROOT, 'hooks/matter-guard.js');
const render = bundleScript('render-production-settings.py', ['--template', path.join(REPO_ROOT, 'managed-settings.json'), '--output', renderedSettings,
  '--firm-name', 'Synthetic Legal', '--org-uuid', '00000000-0000-4000-8000-000000000001', '--matter-roots', '/synthetic-matters', '--disable-telemetry',
  '--sandbox-policy', generatedPolicy, '--hook-path', installedHook]);
check('bundle workflow renders repository template', render.status, 0);
if (render.status === 0) {
  const preflight = bundleScript('preflight-validate.py', ['--mode', 'production', '--evidence-root', currentEvidence, renderedSettings]);
  check('bundle workflow respects target host gate', preflight.status, process.platform === 'linux' ? 0 : 1);
  check('bundle workflow reports correct evidence/host result', preflight.stdout.includes(process.platform === 'linux' ? 'PASS: production preconditions met' : (process.platform === 'win32' ? 'native Windows is not supported' : 'production requires a Linux/WSL2 target')), true);
  const manifestArgs = ['--output', generatedManifest, '--production-settings', renderedSettings, '--sandbox-policy', generatedPolicy, '--allow-dirty'];
  check('bundle workflow creates manifest', run(manifestArgs).code, 0);
  check('bundle workflow verifies manifest', run([...manifestArgs, '--verify']).code, 0);
  const generated = JSON.parse(fs.readFileSync(generatedManifest, 'utf8'));
  check('manifest records explicit tested version', generated.claude_code_version, '2.1.263');
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail ? 1 : 0);
