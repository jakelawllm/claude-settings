/**
 * Tests for scripts/render-production-settings.py.
 *
 *   node tests/render-production-settings.test.js
 *
 * Flat script-style test file under tests/, not a framework suite.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'render-production-settings.py');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rps-'));

function run(args, env) {
  const r = spawnSync('python3', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: env || process.env,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function write(name, obj) {
  const p = path.join(TMP, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  return p;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(60)} want=${String(want).padEnd(6)} got=${got}`
  );
}

const template = {
  _template_comment: 'DEPLOYMENT TEMPLATE — REPLACE-WITH notes removed after rendering',
  _telemetry_note: 'Telemetry note',
  _failIfUnavailable_note: 'SET TO true IN PRODUCTION',
  env: {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'REPLACE-WITH-YOUR-COLLECTOR-OR-DELETE-THESE-FIVE-KEYS',
    CLAUDE_MATTER_ROOTS: 'REPLACE-WITH-YOUR-MATTERS-ROOT-AND-EVERY-ALIAS-SEMICOLON-SEPARATED',
    CLAUDE_MATTER_MODE: 'warn',
  },
  forceLoginOrgUUID: 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID',
  claudeMd: 'REPLACE-WITH-YOUR-FIRM-NAME policy',
  allowManagedHooksOnly: true,
  allowManagedMcpServersOnly: true,
  forceRemoteSettingsRefresh: true,
  disableArtifact: true,
  disableRemoteControl: true,
  allowedMcpServers: [],
  requiredMinimumVersion: '2.1.219',
  permissions: {
    defaultMode: 'default',
    deny: ['Bash(curl:*)'],
  },
  sandbox: {
    enabled: true,
    failIfUnavailable: false,
    allowUnsandboxedCommands: false,
  },
  hooks: {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "/etc/claude-code/hooks/matter-guard.js"' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: 'node "/etc/claude-code/hooks/matter-guard.js"' }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: 'node "/etc/claude-code/hooks/matter-guard.js"' }] }],
  },
};

const sandboxPolicy = {
  sandbox: {
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    filesystem: {
      allowManagedReadPathsOnly: true,
      denyRead: ['/', '~'],
      allowRead: ['/srv/matters', '/Volumes/matters', '/usr/bin', '/opt/claude'],
      allowWrite: ['/srv/matters', '/Volumes/matters', '/tmp/claude-session'],
    },
    network: {
      allowManagedDomainsOnly: true,
      allowedDomains: ['api.anthropic.com', 'collector.internal', 'env-collector.internal'],
    },
  },
};

const templatePath = write('managed-settings.json', template);
const sandboxPolicyPath = write('sandbox-policy.json', sandboxPolicy);
const sandboxArgs = ['--sandbox-policy', sandboxPolicyPath];

// 01-07: render a valid production file
const out1 = path.join(TMP, 'dist', 'managed-settings.production.json');
const r1 = run([
  '--template', templatePath,
  '--output', out1,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters;/Volumes/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  '--hook-path', '/Library/Application Support/ClaudeCode/hooks/matter-guard.js',
  ...sandboxArgs,
]);
check('01 renderer accepts valid CLI inputs', r1.code, 0);
const rendered1 = readJson(out1);
check('02 renderer sets enforce mode', rendered1.env.CLAUDE_MATTER_MODE, 'enforce');
check('03 renderer sets failIfUnavailable true', rendered1.sandbox.failIfUnavailable, true);
check('04 renderer replaces firm name placeholder', rendered1.claudeMd.includes('Acme Legal'), true);
check('05 renderer rewrites hook path', rendered1.hooks.PreToolUse[0].hooks[0].command.includes('/Library/Application Support/ClaudeCode/hooks/matter-guard.js'), true);
check('06 renderer writes OTEL endpoint', rendered1.env.OTEL_EXPORTER_OTLP_ENDPOINT, 'https://collector.internal/v1/traces');
check('07 renderer removes template notes', Object.prototype.hasOwnProperty.call(rendered1, '_template_comment'), false);

// 08-09: refuse overwrite without --force
const r8 = run([
  '--template', templatePath,
  '--output', out1,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  ...sandboxArgs,
]);
check('08 renderer refuses overwrite without --force', r8.code, 1);
check('09 renderer reports overwrite refusal', r8.stdout.includes('already exists'), true);

// 10-12: allow overwrite with --force
const r10 = run([
  '--template', templatePath,
  '--output', out1,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  '--force',
  ...sandboxArgs,
]);
check('10 renderer allows overwrite with --force', r10.code, 0);
const rendered10 = readJson(out1);
check('11 renderer still sets enforce mode on overwrite', rendered10.env.CLAUDE_MATTER_MODE, 'enforce');
check('12 renderer still sets failIfUnavailable on overwrite', rendered10.sandbox.failIfUnavailable, true);

// 13-15: refuse relative matter roots
const out2 = path.join(TMP, 'relative.json');
const r13 = run([
  '--template', templatePath,
  '--output', out2,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', 'matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  ...sandboxArgs,
]);
check('13 renderer rejects relative matter roots', r13.code, 1);
check('14 renderer reports relative matter root', r13.stdout.includes('not an absolute path'), true);
check('15 renderer does not create output on relative root failure', fs.existsSync(out2), false);

// 16-18: explicit telemetry disable removes the OTEL keys
const out3 = path.join(TMP, 'telemetry-disabled.json');
const r16 = run([
  '--template', templatePath,
  '--output', out3,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--disable-telemetry',
  ...sandboxArgs,
]);
check('16 renderer allows explicit telemetry disable', r16.code, 0);
const rendered16 = readJson(out3);
check('17 renderer removes OTEL endpoint when telemetry disabled', Object.prototype.hasOwnProperty.call(rendered16.env, 'OTEL_EXPORTER_OTLP_ENDPOINT'), false);
check('18 renderer warns about telemetry disable', r16.stdout.includes('telemetry is disabled'), true);

// 19-20: environment variables can supply values
const out4 = path.join(TMP, 'from-env.json');
const r19 = run(
  ['--template', templatePath, '--output', out4],
  {
    ...process.env,
    CLAUDE_FIRM_NAME: 'Env Legal',
    CLAUDE_ORG_UUID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    CLAUDE_MATTER_ROOTS: '/srv/env-matters',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://env-collector.internal/v1/traces',
    CLAUDE_SANDBOX_POLICY: sandboxPolicyPath,
  }
);
check('19 renderer accepts env-backed values', r19.code, 0);
const rendered19 = readJson(out4);
check('20 renderer uses env-backed firm name', rendered19.claudeMd.includes('Env Legal'), true);

// 21-22: missing required input fails
const out5 = path.join(TMP, 'missing-org.json');
const r21 = run([
  '--template', templatePath,
  '--output', out5,
  '--firm-name', 'Acme Legal',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  ...sandboxArgs,
]);
check('21 renderer rejects missing org UUID', r21.code, 1);
check('22 renderer reports missing org UUID', r21.stdout.includes('org UUID is required'), true);

// 23-24: missing hooks block fails
const noHooksPath = write('no-hooks.json', { ...template, hooks: undefined });
const out6 = path.join(TMP, 'no-hooks.out.json');
const r23 = run([
  '--template', noHooksPath,
  '--output', out6,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  ...sandboxArgs,
]);
check('23 renderer rejects template with no hooks block', r23.code, 1);
check('24 renderer reports missing hooks block', r23.stdout.includes('template has no hooks block'), true);

// 25-26: missing sandbox policy fails before writing output
const out7 = path.join(TMP, 'missing-sandbox.json');
const r25 = run([
  '--template', templatePath,
  '--output', out7,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
]);
check('25 renderer rejects missing sandbox policy', r25.code, 1);
check('26 renderer reports missing sandbox policy', r25.stdout.includes('sandbox policy is required'), true);

// 27-29: template missing managed-control keys fails closed
const incomplete = { ...template };
delete incomplete.allowedMcpServers;
delete incomplete.requiredMinimumVersion;
const incompletePath = write('incomplete-template.json', incomplete);
const out8 = path.join(TMP, 'incomplete.out.json');
const r27 = run([
  '--template', incompletePath,
  '--output', out8,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  ...sandboxArgs,
]);
check('27 renderer rejects template missing managed-control keys', r27.code, 1);
check('28 renderer reports missing allowedMcpServers', r27.stdout.includes("template missing required key 'allowedMcpServers'"), true);
check('29 renderer does not write incomplete production file', fs.existsSync(out8), false);

// 30-31: template missing permissions.deny fails closed
const noDeny = {
  ...template,
  permissions: { defaultMode: 'default' },
};
const noDenyPath = write('no-deny-template.json', noDeny);
const out9 = path.join(TMP, 'no-deny.out.json');
const r30 = run([
  '--template', noDenyPath,
  '--output', out9,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal/v1/traces',
  ...sandboxArgs,
]);
check('30 renderer rejects template missing permissions.deny', r30.code, 1);
check('31 renderer reports missing permissions.deny block', r30.stdout.includes('template missing permissions.deny block'), true);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail > 0 ? 1 : 0);
