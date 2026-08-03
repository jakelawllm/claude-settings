/**
 * Tests for scripts/preflight-validate.py.
 *
 *   node tests/preflight-validate.test.js
 *
 * Flat script-style test file under tests/, not a framework suite.
 * Each case builds its own fixture and asserts on the exit code and output.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'preflight-validate.py');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));

function run(args, env) {
  const r = spawnSync('python3', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: env || process.env,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function write(file, obj) {
  const p = path.join(TMP, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  return p;
}

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} want=${String(want).padEnd(6)} got=${got}`
  );
}

// ---- template mode -----------------------------------------------------------

// 01-05: template mode accepts placeholders
const template = {
  env: {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'REPLACE-WITH-YOUR-COLLECTOR-OR-DELETE-THESE-FIVE-KEYS',
    CLAUDE_MATTER_ROOTS: 'REPLACE-WITH-YOUR-MATTERS-ROOT-AND-EVERY-ALIAS-SEMICOLON-SEPARATED',
    CLAUDE_MATTER_MODE: 'warn',
  },
  forceLoginOrgUUID: 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID',
  sandbox: { enabled: true, failIfUnavailable: false },
  claudeMd: 'REPLACE-WITH-YOUR-FIRM-NAME policy',
  hooks: {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node /etc/claude-code/hooks/matter-guard.js' }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: 'node /etc/claude-code/hooks/matter-guard.js' }] }],
  },
  allowManagedHooksOnly: true,
  allowManagedMcpServersOnly: true,
  forceRemoteSettingsRefresh: true,
  disableArtifact: true,
  disableRemoteControl: true,
};

const templatePath = write('template.json', template);
const t1 = run(['--mode', 'template', templatePath]);
check('01 template mode accepts placeholder roots', t1.code, 0);
check('02 template mode accepts placeholder org UUID', t1.code, 0);
check('03 template mode accepts placeholder OTEL endpoint', t1.code, 0);
check('04 template mode accepts placeholder claudeMd', t1.code, 0);
check('05 template mode accepts warn mode', t1.code, 0);

// 06-07: template mode still rejects structural faults
const noHooks = { env: {} };
const noHooksPath = write('no-hooks.json', noHooks);
const t6 = run(['--mode', 'template', noHooksPath]);
check('06 template mode rejects missing hooks block', t6.code, 1);
check('07 template mode reports hooks error', t6.stdout.includes('no hooks block'), true);

// ---- production mode --------------------------------------------------------

// 10-15: production mode rejects placeholders
const prodPlaceholder = {
  env: {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'REPLACE-WITH-YOUR-COLLECTOR-OR-DELETE-THESE-FIVE-KEYS',
    CLAUDE_MATTER_ROOTS: 'REPLACE-WITH-YOUR-MATTERS-ROOT-AND-EVERY-ALIAS-SEMICOLON-SEPARATED',
    CLAUDE_MATTER_MODE: 'warn',
  },
  forceLoginOrgUUID: 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID',
  sandbox: { enabled: true, failIfUnavailable: false },
  claudeMd: 'REPLACE-WITH-YOUR-FIRM-NAME policy',
  hooks: {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node /etc/claude-code/hooks/matter-guard.js' }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: 'node /etc/claude-code/hooks/matter-guard.js' }] }],
  },
  allowManagedHooksOnly: true,
  allowManagedMcpServersOnly: true,
  forceRemoteSettingsRefresh: true,
  disableArtifact: true,
  disableRemoteControl: true,
};
const prodPlaceholderPath = write('prod-placeholder.json', prodPlaceholder);
const t10 = run(['--mode', 'production', prodPlaceholderPath]);
check('10 production mode rejects placeholder roots', t10.code, 1);
check('11 production mode reports roots error', t10.stdout.includes('CLAUDE_MATTER_ROOTS still contains a REPLACE-WITH placeholder'), true);

const prodPlaceholder2 = JSON.parse(JSON.stringify(prodPlaceholder));
prodPlaceholder2.forceLoginOrgUUID = 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID';
const prodPlaceholder2Path = write('prod-placeholder2.json', prodPlaceholder2);
const t12 = run(['--mode', 'production', prodPlaceholder2Path]);
check('12 production mode rejects placeholder org UUID', t12.code, 1);
check('13 production mode reports org UUID error', t12.stdout.includes('forceLoginOrgUUID still contains a REPLACE-WITH placeholder'), true);

const prodPlaceholder3 = JSON.parse(JSON.stringify(prodPlaceholder));
prodPlaceholder3.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'REPLACE-WITH-YOUR-COLLECTOR-OR-DELETE-THESE-FIVE-KEYS';
const prodPlaceholder3Path = write('prod-placeholder3.json', prodPlaceholder3);
const t14 = run(['--mode', 'production', prodPlaceholder3Path]);
check('14 production mode rejects placeholder OTEL endpoint', t14.code, 1);
check('15 production mode reports OTEL endpoint error', t14.stdout.includes('OTEL_EXPORTER_OTLP_ENDPOINT still contains a REPLACE-WITH placeholder'), true);

// 16-18: production mode rejects warn mode and sandbox settings
const prodWarn = JSON.parse(JSON.stringify(prodPlaceholder));
prodWarn.env.CLAUDE_MATTER_ROOTS = '/tmp/matters';
prodWarn.forceLoginOrgUUID = '11111111-2222-3333-4444-555555555555';
prodWarn.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
prodWarn.env.CLAUDE_MATTER_MODE = 'warn';
prodWarn.sandbox.failIfUnavailable = false;
prodWarn.claudeMd = 'Acme Legal policy';
const prodWarnPath = write('prod-warn.json', prodWarn);
const t16 = run(['--mode', 'production', prodWarnPath]);
check('16 production mode rejects warn mode', t16.code, 1);
check('17 production mode reports warn mode error', t16.stdout.includes("CLAUDE_MATTER_MODE is 'warn'"), true);
check('18 production mode reports sandbox failIfUnavailable error', t16.stdout.includes('sandbox.failIfUnavailable is not true'), true);

// 20-22: production mode accepts a valid production file
const prodGood = JSON.parse(JSON.stringify(prodWarn));
prodGood.env.CLAUDE_MATTER_MODE = 'enforce';
prodGood.sandbox.failIfUnavailable = true;
prodGood.sandbox.enabled = true;
prodGood.sandbox.allowUnsandboxedCommands = false;
const prodGoodPath = write('prod-good.json', prodGood);
const t20 = run(['--mode', 'production', prodGoodPath]);
check('20 production mode accepts valid production file', t20.code, 0);
check('21 production mode reports PASS', t20.stdout.includes('PASS: production preconditions met'), true);
check('22 production mode reports note', t20.stdout.includes('engineering readiness gate'), true);

// 23-24: production mode rejects missing managed controls
const prodNoControls = JSON.parse(JSON.stringify(prodGood));
delete prodNoControls.allowManagedHooksOnly;
delete prodNoControls.allowManagedMcpServersOnly;
delete prodNoControls.forceRemoteSettingsRefresh;
delete prodNoControls.disableArtifact;
delete prodNoControls.disableRemoteControl;
const prodNoControlsPath = write('prod-no-controls.json', prodNoControls);
const t23 = run(['--mode', 'production', prodNoControlsPath]);
check('23 production mode rejects missing managed controls', t23.code, 1);
check('24 production mode reports missing control', t23.stdout.includes('allowManagedHooksOnly is not true'), true);

// 25-26: production mode rejects missing hook events
const prodNoHooks = JSON.parse(JSON.stringify(prodGood));
delete prodNoHooks.hooks;
const prodNoHooksPath = write('prod-no-hooks.json', prodNoHooks);
const t25 = run(['--mode', 'production', prodNoHooksPath]);
check('25 production mode rejects missing hooks block', t25.code, 1);
check('26 production mode reports missing hooks', t25.stdout.includes('no hooks block'), true);

// 27-28: production mode rejects wrong hook command
const prodWrongHook = JSON.parse(JSON.stringify(prodGood));
prodWrongHook.hooks.PreToolUse[0].hooks[0].command = 'node /usr/local/bin/other-hook.js';
const prodWrongHookPath = write('prod-wrong-hook.json', prodWrongHook);
const t27 = run(['--mode', 'production', prodWrongHookPath]);
check('27 production mode rejects wrong hook command', t27.code, 1);
check('28 production mode reports wrong hook command', t27.stdout.includes('does not invoke matter-guard.js'), true);

// ---- quiet flag --------------------------------------------------------------

// 30-31: quiet flag suppresses warnings and notes
const t30 = run(['--mode', 'template', '--quiet', templatePath]);
check('30 quiet flag suppresses warnings', !t30.stdout.includes('WARNING:'), true);
check('31 quiet flag still passes', t30.code, 0);

// ---- cleanup ----------------------------------------------------------------
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail > 0 ? 1 : 0);
