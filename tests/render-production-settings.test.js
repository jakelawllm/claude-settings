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
  const r = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [SCRIPT, ...args], {
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
  _template_comment: 'DEPLOYMENT TEMPLATE â€” REPLACE-WITH notes removed after rendering',
  _telemetry_note: 'Telemetry note',
  _failIfUnavailable_note: 'SET TO true IN PRODUCTION',
  env: {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1', CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'REPLACE-WITH-YOUR-COLLECTOR-OR-DELETE-THESE-FIVE-KEYS',
    CLAUDE_MATTER_ROOTS: 'REPLACE-WITH-YOUR-MATTERS-ROOT-AND-EVERY-ALIAS-SEMICOLON-SEPARATED',
    CLAUDE_MATTER_MODE: 'warn',
    OTEL_LOG_USER_PROMPTS: '0', OTEL_LOG_ASSISTANT_RESPONSES: '0',
    OTEL_LOG_TOOL_DETAILS: '0', OTEL_LOG_TOOL_CONTENT: '0', OTEL_LOG_RAW_API_BODIES: '0',
  },
  forceLoginOrgUUID: 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID',
  claudeMd: 'REPLACE-WITH-YOUR-FIRM-NAME policy',
  allowManagedHooksOnly: true,
  allowManagedMcpServersOnly: true,
  forceRemoteSettingsRefresh: true,
  disableArtifact: true,
  disableRemoteControl: true,
  allowedMcpServers: [],
  requiredMinimumVersion: '2.1.251',
  requiredMaximumVersion: '2.1.300',
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
      allowRead: ['/srv/matters/Smith', '/usr/bin', '/opt/claude'],
      allowWrite: ['/srv/matters/Smith', '/tmp/claude-session'],
    },
    network: {
      allowManagedDomainsOnly: true,
      allowedDomains: ['api.anthropic.com', 'collector.internal', 'env-collector.internal'],
    },
  },
};

sandboxPolicy.sandbox.credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test-fixtures', 'synthetic-sandbox-policy.json'), 'utf8')).sandbox.credentials;

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
  '--otel-endpoint', 'https://collector.internal',
  '--hook-path', '/Library/Application Support/ClaudeCode/hooks/matter-guard.js',
  ...sandboxArgs,
]);
check('01 renderer accepts valid CLI inputs', r1.code, 0);
const rendered1 = readJson(out1);
check('02 renderer sets enforce mode', rendered1.env.CLAUDE_MATTER_MODE, 'enforce');
check('03 renderer sets failIfUnavailable true', rendered1.sandbox.failIfUnavailable, true);
check('04 renderer replaces firm name placeholder', rendered1.claudeMd.includes('Acme Legal'), true);
check('05 renderer rewrites hook path', rendered1.hooks.PreToolUse[0].hooks[0].command.includes('/Library/Application Support/ClaudeCode/hooks/matter-guard.js'), true);
check('06 renderer writes OTEL endpoint', rendered1.env.OTEL_EXPORTER_OTLP_ENDPOINT, 'https://collector.internal');
check('07 renderer removes template notes', Object.prototype.hasOwnProperty.call(rendered1, '_template_comment'), false);

// 08-09: refuse overwrite without --force
const r8 = run([
  '--template', templatePath,
  '--output', out1,
  '--firm-name', 'Acme Legal',
  '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters',
  '--otel-endpoint', 'https://collector.internal',
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
  '--otel-endpoint', 'https://collector.internal',
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
  '--otel-endpoint', 'https://collector.internal',
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
    CLAUDE_MATTER_ROOTS: '/srv/matters',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://env-collector.internal',
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
  '--otel-endpoint', 'https://collector.internal',
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
  '--otel-endpoint', 'https://collector.internal',
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
  '--otel-endpoint', 'https://collector.internal',
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
  '--otel-endpoint', 'https://collector.internal',
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
  '--otel-endpoint', 'https://collector.internal',
  ...sandboxArgs,
]);
check('30 renderer rejects template missing permissions.deny', r30.code, 1);
check('31 renderer reports missing permissions.deny block', r30.stdout.includes('template missing permissions.deny block'), true);

// Refusal paths must leave a previous deployable bundle byte-for-byte intact.
const validArgs = ['--template', templatePath, '--output', out1, '--force',
  '--firm-name', 'Synthetic Legal', '--org-uuid', '11111111-2222-3333-4444-555555555555',
  '--matter-roots', '/srv/matters', '--disable-telemetry', ...sandboxArgs];
for (const [label, args] of [
  ['bad UUID', ['--org-uuid', 'invalid']],
  ['filesystem root', ['--matter-roots', '/']],
  ['UNC root', ['--matter-roots', '//server/share']],
  ['dot segments', ['--matter-roots', '/srv/../matters']],
  ['hook shell expansion', ['--hook-path', '/tmp/$(touch injected)/matter-guard.js']],
  ['hook command newline', ['--hook-path', '/tmp/\nmatter-guard.js']],
  ['wrong hook filename', ['--hook-path', '/tmp/other.js']],
]) {
  const before = fs.readFileSync(out1, 'utf8');
  const result = run([...validArgs, ...args]);
  check(`${label} rejected`, result.code, 1);
  check(`${label} preserves existing output`, fs.readFileSync(out1, 'utf8') === before, true);
}
for (const [label, mutate] of [
  ['false managed lock', obj => { obj.allowManagedHooksOnly = false; }],
  ['disabled content gate missing', obj => { delete obj.env.OTEL_LOG_RAW_API_BODIES; }],
  ['empty deny policy', obj => { obj.permissions.deny = []; }],
  ['malformed env', obj => { obj.env = []; }],
  ['missing guard hook', obj => { delete obj.hooks.PreToolUse; }],
  ['filtered guard hook', obj => { obj.hooks.PreToolUse[0].matcher = 'Read'; }],
  ['async guard hook', obj => { obj.hooks.PreToolUse[0].hooks[0].async = true; }],
  ['fake hook executable', obj => { obj.hooks.PreToolUse[0].hooks[0].command = 'echo /etc/claude-code/hooks/matter-guard.js'; }],
  ['inverted version range', obj => { obj.requiredMinimumVersion = '2.1.301'; }],
]) {
  const candidate = structuredClone(template);
  mutate(candidate);
  const source = write(`mutation-${label}.json`, candidate);
  const before = fs.readFileSync(out1, 'utf8');
  const result = run([...validArgs, '--template', source]);
  check(`${label} rejected`, result.code, 1);
  check(`${label} emits error without traceback`, result.stdout.includes('ERROR:') && !result.stderr.includes('Traceback'), true);
  check(`${label} preserves output`, fs.readFileSync(out1, 'utf8') === before, true);
}
const widePolicy = structuredClone(sandboxPolicy);
widePolicy.sandbox.filesystem.allowRead.push('/srv/matters/Jones');
check('sibling matter exposure rejected', run([...validArgs, '--sandbox-policy', write('wide-policy.json', widePolicy)]).code, 1);
const homeDenyPolicy = structuredClone(sandboxPolicy);
homeDenyPolicy.sandbox.filesystem.denyRead = ['~'];
check('home-only denial rejected', run([...validArgs, '--sandbox-policy', write('home-deny.json', homeDenyPolicy)]).code, 1);
const quotedPath = "/opt/Synthetic Owner's hooks/matter-guard.js";
check('literal quoted hook path accepted', run([...validArgs, '--hook-path', quotedPath]).code, 0);
const roundTrip = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
  ['-c', 'import json,shlex,sys; print(json.dumps(shlex.split(sys.argv[1])))', readJson(out1).hooks.PreToolUse[0].hooks[0].command], { encoding: 'utf8' });
check('hook shell quoting round-trips exactly', JSON.stringify(JSON.parse(roundTrip.stdout)) === JSON.stringify(['node', quotedPath]), true);
const inputBefore = fs.readFileSync(templatePath, 'utf8');
check('renderer refuses overwriting its template', run([...validArgs, '--output', templatePath]).code, 1);
check('template bytes preserved', fs.readFileSync(templatePath, 'utf8') === inputBefore, true);
const badParent = path.join(TMP, 'parent-is-file');
fs.writeFileSync(badParent, 'synthetic');
const badWrite = run([...validArgs, '--output', path.join(badParent, 'output.json')]);
check('write failure is handled', badWrite.code, 1);
check('write failure has no traceback', badWrite.stderr.includes('Traceback'), false);
const telemetryArgs = validArgs.filter(arg => arg !== '--disable-telemetry');
for (const endpoint of [
  'https://collector.internal?synthetic=1', 'https://collector.internal?',
  'https://collector.internal#fragment', 'https://collector.internal#',
  'https://collector.internal/v1/traces', 'https://collector.internal/v1/logs',
  'https://collector.internal/v1/metrics', 'https://collector.internal/v1/traces/',
  'https://collector.internal/otlp/v1/logs', 'https://collector.internal/v1/%74races',
]) {
  const before = fs.readFileSync(out1, 'utf8');
  const result = run([...telemetryArgs, '--otel-endpoint', endpoint]);
  check(`invalid OTLP base URL rejected: ${endpoint}`, result.code, 1);
  check('invalid endpoint preserves output', fs.readFileSync(out1, 'utf8') === before, true);
}
const basePathEndpoint = 'https://collector.internal/otlp';
check('HTTPS collector base path accepted', run([...telemetryArgs, '--otel-endpoint', basePathEndpoint]).code, 0);
check('collector base path retained exactly', readJson(out1).env.OTEL_EXPORTER_OTLP_ENDPOINT, basePathEndpoint);
if (process.platform !== 'win32') check('rendered file is owner-only', fs.statSync(out1).mode & 0o777, 0o600);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail > 0 ? 1 : 0);
