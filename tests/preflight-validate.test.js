/**
 * Tests for scripts/preflight-validate.py.
 *
 *   node tests/preflight-validate.test.js
 *
 * Flat script-style test file under tests/, not a framework suite.
 * Each case builds its own fixture and asserts on the exit code and output.
 *
 * Production fixtures use the literal ${REPO_ROOT} token in hook commands so
 * the hook path resolves to the real hooks/matter-guard.js on the build host.
 * Template fixtures use the deployment placeholder path that is not present
 * on the build host (so we only warn there).
 *
 * The settings files for production fixtures are written into a directory that
 * also contains resolved governance registers (test-fixtures/docs/), so the
 * registers resolve to non-PENDING, non-REPLACE-WITH values for the happy
 * path. Mutation fixtures copy the synthetic fixture's docs subtree.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');

const { UTC_DAY, shiftedDate, dateFixture, copyEvidence } = require('./synthetic-evidence');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'preflight-validate.py');
const REPO_ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
const HOOK = 'node "${REPO_ROOT}/hooks/matter-guard.js"';

// Resolved governance registers, copied next to production fixtures so the
// happy path does not fail on the repo-root registers (which are deliberately
// unresolved in the template).
const REGISTER_DIR = path.join(REPO_ROOT, 'test-fixtures', 'docs');

function copyRegisters(destDir) {
  if (!fs.existsSync(path.join(destDir, 'docs'))) copyEvidence(destDir);
}

function run(args, env) {
  const settingFile = [...args].reverse().find(a => a.endsWith('.json'));
  if (!args.includes('--evidence-root') && settingFile && fs.existsSync(path.join(path.dirname(settingFile), 'docs'))) args = [...args, '--evidence-root', path.dirname(settingFile)];
  const r = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [SCRIPT, ...args], {
    encoding: 'utf8',
    env: env || process.env,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function write(file, obj, withRegisters) {
  const dir = path.join(TMP, path.dirname(file) || '.');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(TMP, file);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  if (withRegisters) copyRegisters(dir);
  return p;
}

const productionExit = process.platform === 'linux' ? 0 : 1;
const hostError = process.platform === 'win32' ? 'native Windows is not supported' : 'production requires a Linux/WSL2 target';
let pass = 0;
let fail = 0;

function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} want=${String(want).padEnd(6)} got=${got}`
  );
}

// A complete production baseline. Production tests clone this and mutate one
// field, so each mutation is isolated and the error message is unambiguous.
function prodBase() {
  return {
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    env: {
      CLAUDE_CODE_ENABLE_TELEMETRY: '1', CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_LOGS_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://synthetic-otel.example.invalid:4318',
      CLAUDE_MATTER_ROOTS: '/synthetic-matters',
      CLAUDE_MATTER_MODE: 'enforce',
      OTEL_LOG_USER_PROMPTS: '0', OTEL_LOG_ASSISTANT_RESPONSES: '0',
      OTEL_LOG_TOOL_DETAILS: '0', OTEL_LOG_TOOL_CONTENT: '0', OTEL_LOG_RAW_API_BODIES: '0',
    },
    requiredMinimumVersion: '2.1.251',
    requiredMaximumVersion: '2.1.300',
    forceLoginMethod: 'claudeai',
    forceLoginOrgUUID: '00000000-0000-4000-8000-000000000001',
    allowManagedHooksOnly: true,
    allowManagedMcpServersOnly: true,
    forceRemoteSettingsRefresh: true,
    disableArtifact: true,
    disableRemoteControl: true,
    allowedMcpServers: [],
    permissions: { deny: ['Bash(curl:*)'], defaultMode: 'default' },
    claudeMd: 'Synthetic-firm policy for all Claude Code use.',
    hooks: {
      PreToolUse: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: HOOK }],
        },
      ],
      SessionStart: [
        { hooks: [{ type: 'command', command: HOOK }] },
      ],
      SessionEnd: [
        { hooks: [{ type: 'command', command: HOOK }] },
      ],
    },
    sandbox: {
      credentials: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'test-fixtures', 'synthetic-sandbox-policy.json'), 'utf8')).sandbox.credentials,
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        allowManagedReadPathsOnly: true,
        denyRead: ['/', '~'],
        allowRead: ['/synthetic-matters/Smith', '/usr/bin', '/opt/claude'],
        allowWrite: ['/synthetic-matters/Smith', '/tmp/claude-session'],
      },
      network: {
        allowManagedDomainsOnly: true,
        allowedDomains: ['api.anthropic.com', 'synthetic-otel.example.invalid'],
      },
    },
  };
}

// ---- template mode -----------------------------------------------------------

// 01-05: template mode accepts placeholders
const template = {
  env: {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1', CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'REPLACE-WITH-YOUR-COLLECTOR-OR-DELETE-THESE-FIVE-KEYS',
    CLAUDE_MATTER_ROOTS: 'REPLACE-WITH-YOUR-MATTERS-ROOT-AND-EVERY-ALIAS-SEMICOLON-SEPARATED',
    CLAUDE_MATTER_MODE: 'warn',
  },
  forceLoginOrgUUID: 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID',
  sandbox: { enabled: true, failIfUnavailable: false, allowUnsandboxedCommands: false },
  claudeMd: 'REPLACE-WITH-YOUR-FIRM-NAME policy',
  hooks: {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node /etc/claude-code/hooks/matter-guard.js' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: 'node /etc/claude-code/hooks/matter-guard.js' }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: 'node /etc/claude-code/hooks/matter-guard.js' }] }],
  },
  allowManagedHooksOnly: true,
  allowManagedMcpServersOnly: true,
  forceRemoteSettingsRefresh: true,
  disableArtifact: true,
  disableRemoteControl: true,
};

const templatePath = write('template.json', template, false);
const t1 = run(['--mode', 'template', templatePath]);
check('01 template mode accepts placeholder roots', t1.code, 0);
check('02 template mode accepts placeholder org UUID', t1.code, 0);
check('03 template mode accepts placeholder OTEL endpoint', t1.code, 0);
check('04 template mode accepts placeholder claudeMd', t1.code, 0);
check('05 template mode accepts warn mode', t1.code, 0);

// 06-07: template mode still rejects structural faults
const noHooks = { ...template, hooks: undefined };
const noHooksPath = write('no-hooks.json', noHooks, false);
const t6 = run(['--mode', 'template', noHooksPath]);
check('06 template mode rejects missing hooks block', t6.code, 1);
check('07 template mode reports hooks error', t6.stdout.includes('no hooks block'), true);

// ---- production mode --------------------------------------------------------

// 10-15: production mode rejects placeholders
const prodPlaceholder = prodBase();
prodPlaceholder.env.CLAUDE_MATTER_ROOTS = 'REPLACE-WITH-YOUR-MATTERS-ROOT';
prodPlaceholder.forceLoginOrgUUID = 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID';
prodPlaceholder.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'REPLACE-WITH-YOUR-COLLECTOR';
prodPlaceholder.env.CLAUDE_MATTER_MODE = 'warn';
const prodPlaceholderPath = write('prod-placeholder.json', prodPlaceholder, true);
const t10 = run(['--mode', 'production', prodPlaceholderPath]);
check('10 production mode rejects placeholder roots', t10.code, 1);
check('11 production mode reports roots error', t10.stdout.includes('CLAUDE_MATTER_ROOTS still contains a REPLACE-WITH placeholder'), true);

const prodPlaceholder2 = prodBase();
prodPlaceholder2.forceLoginOrgUUID = 'REPLACE-WITH-YOUR-FIRM-CLAUDE-ORG-UUID';
const prodPlaceholder2Path = write('prod-placeholder2.json', prodPlaceholder2, true);
const t12 = run(['--mode', 'production', prodPlaceholder2Path]);
check('12 production mode rejects placeholder org UUID', t12.code, 1);
check('13 production mode reports org UUID error', t12.stdout.includes('forceLoginOrgUUID still contains a REPLACE-WITH placeholder'), true);

const prodPlaceholder3 = prodBase();
prodPlaceholder3.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'REPLACE-WITH-YOUR-COLLECTOR';
const prodPlaceholder3Path = write('prod-placeholder3.json', prodPlaceholder3, true);
const t14 = run(['--mode', 'production', prodPlaceholder3Path]);
check('14 production mode rejects placeholder OTEL endpoint', t14.code, 1);
check('15 production mode reports OTEL endpoint error', t14.stdout.includes('OTEL_EXPORTER_OTLP_ENDPOINT still contains a REPLACE-WITH placeholder'), true);

// 16-18: production mode rejects warn mode and sandbox settings
const prodWarn = prodBase();
prodWarn.env.CLAUDE_MATTER_MODE = 'warn';
prodWarn.sandbox.failIfUnavailable = false;
const prodWarnPath = write('prod-warn.json', prodWarn, true);
const t16 = run(['--mode', 'production', prodWarnPath]);
check('16 production mode rejects warn mode', t16.code, 1);
check('17 production mode reports warn mode error', t16.stdout.includes("CLAUDE_MATTER_MODE is 'warn'"), true);
check('18 production mode reports sandbox failIfUnavailable error', t16.stdout.includes('sandbox.failIfUnavailable is not true'), true);

// 20-22: production mode accepts a valid production file
const prodGood = prodBase();
const prodGoodPath = write('prod-good.json', prodGood, true);
const t20 = run(['--mode', 'production', prodGoodPath]);
check('20 production config observes native Windows exclusion', t20.code, productionExit);
check('21 valid production config reports expected host outcome', t20.stdout.includes(productionExit ? hostError : 'PASS: production preconditions met'), true);
check('22 production mode reports note', t20.stdout.includes('engineering readiness gate'), productionExit === 0);

check('valid production baseline has no unrelated errors', (t20.stdout.match(/^ERROR:/gm) || []).length, productionExit);

// 23-24: production mode rejects missing managed controls
const prodNoControls = prodBase();
delete prodNoControls.allowManagedHooksOnly;
delete prodNoControls.allowManagedMcpServersOnly;
delete prodNoControls.forceRemoteSettingsRefresh;
delete prodNoControls.disableArtifact;
delete prodNoControls.disableRemoteControl;
const prodNoControlsPath = write('prod-no-controls.json', prodNoControls, true);
const t23 = run(['--mode', 'production', prodNoControlsPath]);
check('23 production mode rejects missing managed controls', t23.code, 1);
check('24 production mode reports missing control', t23.stdout.includes('allowManagedHooksOnly is not true'), true);

// 25-26: production mode rejects missing hook events
const prodNoHooks = prodBase();
delete prodNoHooks.hooks;
const prodNoHooksPath = write('prod-no-hooks.json', prodNoHooks, true);
const t25 = run(['--mode', 'production', prodNoHooksPath]);
check('25 production mode rejects missing hooks block', t25.code, 1);
check('26 production mode reports missing hooks', t25.stdout.includes('no hooks block'), true);

// 27-28: production mode rejects wrong hook command
const prodWrongHook = prodBase();
prodWrongHook.hooks.PreToolUse[0].hooks[0].command = 'node /usr/local/bin/other-hook.js';
const prodWrongHookPath = write('prod-wrong-hook.json', prodWrongHook, true);
const t27 = run(['--mode', 'production', prodWrongHookPath]);
check('27 production mode rejects wrong hook command', t27.code, 1);
check('28 production mode reports wrong hook command', t27.stdout.includes('does not invoke matter-guard.js'), true);

// 30: production mode rejects malformed UUID
const prodBadUuid = prodBase();
prodBadUuid.forceLoginOrgUUID = 'not-a-uuid';
const prodBadUuidPath = write('prod-bad-uuid.json', prodBadUuid, true);
const t30 = run(['--mode', 'production', prodBadUuidPath]);
check('30 production mode rejects malformed UUID', t30.code, 1);
check('31 production mode reports UUID error', t30.stdout.includes('forceLoginOrgUUID is not a valid UUID'), true);

// 32: production mode rejects missing SessionStart
const prodNoSessionStart = prodBase();
delete prodNoSessionStart.hooks.SessionStart;
const prodNoSessionStartPath = write('prod-no-sessionstart.json', prodNoSessionStart, true);
const t32 = run(['--mode', 'production', prodNoSessionStartPath]);
check('32 production mode rejects missing SessionStart', t32.code, 1);
check('33 production mode reports missing SessionStart', t32.stdout.includes('missing hook event: SessionStart'), true);

// 34: production mode rejects non-TLS OTEL endpoint
const prodHttpOtel = prodBase();
prodHttpOtel.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
const prodHttpOtelPath = write('prod-http-otel.json', prodHttpOtel, true);
const t34 = run(['--mode', 'production', prodHttpOtelPath]);
check('34 production mode rejects non-TLS OTEL endpoint', t34.code, 1);
check('35 production mode reports TLS error', t34.stdout.includes('OTEL_EXPORTER_OTLP_ENDPOINT must start with https://'), true);

// 36: production mode rejects non-empty allowedMcpServers
const prodMcp = prodBase();
prodMcp.allowedMcpServers = ['github'];
const prodMcpPath = write('prod-mcp.json', prodMcp, true);
const t36 = run(['--mode', 'production', prodMcpPath]);
check('36 production mode rejects non-empty allowedMcpServers', t36.code, 1);
check('37 production mode reports MCP error', t36.stdout.includes('allowedMcpServers must be an empty array'), true);

// 38: production mode rejects missing allowManagedReadPathsOnly
const prodNoFsLock = prodBase();
delete prodNoFsLock.sandbox.filesystem.allowManagedReadPathsOnly;
const prodNoFsLockPath = write('prod-no-fslock.json', prodNoFsLock, true);
const t38 = run(['--mode', 'production', prodNoFsLockPath]);
check('38 production mode rejects missing filesystem lock', t38.code, 1);
check('39 production mode reports filesystem lock error', t38.stdout.includes('sandbox.filesystem.allowManagedReadPathsOnly must be true'), true);

// 40: production mode rejects missing allowManagedDomainsOnly
const prodNoNetLock = prodBase();
delete prodNoNetLock.sandbox.network.allowManagedDomainsOnly;
const prodNoNetLockPath = write('prod-no-netlock.json', prodNoNetLock, true);
const t40 = run(['--mode', 'production', prodNoNetLockPath]);
check('40 production mode rejects missing network lock', t40.code, 1);
check('41 production mode reports network lock error', t40.stdout.includes('sandbox.network.allowManagedDomainsOnly must be true'), true);

// 42: production mode rejects allowManagedReadPathsOnly without denyRead
const prodNoDeny = prodBase();
prodNoDeny.sandbox.filesystem.denyRead = [];
const prodNoDenyPath = write('prod-no-deny.json', prodNoDeny, true);
const t42 = run(['--mode', 'production', prodNoDenyPath]);
check('42 production mode rejects missing denyRead entry', t42.code, 1);
check('43 production mode reports denyRead error', t42.stdout.includes("denyRead must include '/'"), true);

// 44: production mode rejects allowManagedDomainsOnly with empty allowedDomains
const prodNoDomains = prodBase();
prodNoDomains.sandbox.network.allowedDomains = [];
const prodNoDomainsPath = write('prod-no-domains.json', prodNoDomains, true);
const t44 = run(['--mode', 'production', prodNoDomainsPath]);
check('44 production mode rejects empty allowedDomains', t44.code, 1);
check('45 production mode reports domains error', t44.stdout.includes('allowedDomains must be a non-empty array'), true);

// 46: production mode rejects missing requiredMinimumVersion
const prodNoVersion = prodBase();
delete prodNoVersion.requiredMinimumVersion;
const prodNoVersionPath = write('prod-no-version.json', prodNoVersion, true);
const t46 = run(['--mode', 'production', prodNoVersionPath]);
check('46 production mode rejects missing requiredMinimumVersion', t46.code, 1);
check('47 production mode reports version error', t46.stdout.includes('requiredMinimumVersion is missing'), true);

// 48-49: production mode rejects unresolved governance registers
const prodUnresolved = prodBase();
// Write into a fresh dir with the repo-root (unresolved) registers by NOT
// copying the resolved test-fixtures docs.
const prodUnresolvedDir = path.join(TMP, 'unresolved');
fs.mkdirSync(prodUnresolvedDir, { recursive: true });
const prodUnresolvedPath = path.join(prodUnresolvedDir, 'prod-unresolved.json');
fs.writeFileSync(prodUnresolvedPath, JSON.stringify(prodUnresolved, null, 2) + '\n');
const t48 = run(['--mode', 'production', prodUnresolvedPath]);
check('48 production mode rejects unresolved register', t48.code, 1);
check('49 production mode reports register error', t48.stdout.includes('governance register unresolved'), true);

// 50-53: operational evidence placeholders block production but only warn in
// template mode. A resolved synthetic fixture remains the production happy path.
const operationalPlaceholderDir = path.join(TMP, 'operational-placeholder');
const operationalPlaceholderPath = write(
  path.join('operational-placeholder', 'settings.json'),
  prodBase(),
  true
);
const operationalRegister = path.join(
  operationalPlaceholderDir,
  'docs',
  'operational-evidence-register.md'
);
fs.writeFileSync(
  operationalRegister,
  fs.readFileSync(path.join(REPO_ROOT, 'docs', 'operational-evidence-register.md'))
);
const t50 = run(['--mode', 'production', operationalPlaceholderPath]);
check('50 production mode rejects operational evidence placeholders', t50.code, 1);
check(
  '51 production mode names operational evidence register',
  t50.stdout.includes('docs/operational-evidence-register.md'),
  true
);
const t52 = run(['--mode', 'template', operationalPlaceholderPath]);
check('52 template mode accepts operational evidence placeholders', t52.code, 0);
check(
  '53 template mode warns on operational evidence register',
  t52.stdout.includes('docs/operational-evidence-register.md'),
  true
);

// 54-55: deleting a required operational gate must not satisfy production mode.
const operationalMissingDir = path.join(TMP, 'operational-missing-gate');
const operationalMissingPath = write(
  path.join('operational-missing-gate', 'settings.json'),
  prodBase(),
  true
);
const operationalMissingRegister = path.join(
  operationalMissingDir,
  'docs',
  'operational-evidence-register.md'
);
const missingGateText = fs
  .readFileSync(path.join(REGISTER_DIR, 'operational-evidence-register.md'), 'utf8')
  .split('\n')
  .filter((line) => !line.includes('Independent security review'))
  .join('\n');
fs.writeFileSync(operationalMissingRegister, dateFixture(missingGateText));
const t54 = run(['--mode', 'production', operationalMissingPath]);
check('54 production mode rejects missing operational evidence gate', t54.code, 1);
check(
  '55 production mode reports missing operational evidence gate',
  t54.stdout.includes('operational evidence register missing gate'),
  true
);

// ---- OAuth governance register: scope-aware, positive field validation -----

function writeOauthDoc(dir, content) {
  const target = path.join(dir, 'docs', 'policy-decisions', 'oauth-token-management.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const OAUTH_DECISION_RECORD = dateFixture(`## Decision record

- Decision: Option B â€” synthetic static-token exception
- Decided by: Synthetic Test Owner
- Date: 2026-08-04
- Rationale: Synthetic production validator fixture only.
- Token owner: Synthetic Test Owner
- Storage location: synthetic GitHub Actions repository secret name only
- Minimum permissions: contents, pull-requests, issues and actions: read
- Rotation interval: 90 days
- Last rotated: 2026-08-04
- Next rotation due: 2026-11-02
- Emergency revocation procedure: synthetic issuer revocation procedure
- Monitoring owner: Synthetic Test Owner
- Migration trigger: synthetic federation setup approved
`);

const OAUTH_COMPLETE_PROD = `# Policy decision: OAuth token management for Claude workflows

## Status

APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE

${OAUTH_DECISION_RECORD}`;

const OAUTH_COMPLETE_PROD_STATUS_LINE = `# Policy decision: OAuth token management for Claude workflows

Status: APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE

${OAUTH_DECISION_RECORD}`;

// 60: production mode rejects an internal-beta-only OAuth status even when
// every operational field is filled â€” beta approval must never satisfy a
// production gate.
const prodOauthBeta = prodBase();
const prodOauthBetaDir = path.join(TMP, 'oauth-beta');
const prodOauthBetaPath = write(path.join('oauth-beta', 'settings.json'), prodOauthBeta, true);
writeOauthDoc(
  prodOauthBetaDir,
  OAUTH_COMPLETE_PROD.replace(
    'APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE',
    'APPROVED FOR INTERNAL BETA ONLY â€” synthetic'
  )
);
const t60 = run(['--mode', 'production', prodOauthBetaPath]);
check('60 production mode rejects internal-beta-only OAuth status', t60.code, 1);
check(
  '61 production mode reports OAuth status not approved for production',
  t60.stdout.includes('oauth-token-management status is not approved for production'),
  true
);

// 62: a negative status containing the word APPROVED must not pass.
const prodOauthNegative = prodBase();
const prodOauthNegativeDir = path.join(TMP, 'oauth-negative-status');
const prodOauthNegativePath = write(
  path.join('oauth-negative-status', 'settings.json'),
  prodOauthNegative,
  true
);
writeOauthDoc(
  prodOauthNegativeDir,
  OAUTH_COMPLETE_PROD.replace(
    'APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE',
    'NOT APPROVED â€” synthetic'
  )
);
const t62 = run(['--mode', 'production', prodOauthNegativePath]);
check('62 production mode rejects negative OAuth status', t62.code, 1);
check(
  '63 production mode reports negative OAuth status',
  t62.stdout.includes('oauth-token-management status is not APPROVED'),
  true
);

// 64: production mode rejects an OAuth doc missing a required Option B field.
const prodOauthMissingField = prodBase();
const prodOauthMissingDir = path.join(TMP, 'oauth-missing-field');
const prodOauthMissingPath = write(
  path.join('oauth-missing-field', 'settings.json'),
  prodOauthMissingField,
  true
);
writeOauthDoc(
  prodOauthMissingDir,
  OAUTH_COMPLETE_PROD.replace('- Monitoring owner: Synthetic Test Owner\n', '')
);
const t64 = run(['--mode', 'production', prodOauthMissingPath]);
check('64 production mode rejects OAuth doc missing a required field', t64.code, 1);
check(
  "65 production mode reports OAuth field 'Monitoring owner' unresolved",
  t64.stdout.includes(`oauth-token-management field 'Monitoring owner' is unresolved`),
  true
);

// 66: production mode rejects an OAuth doc with a PENDING required field.
const prodOauthPendingField = prodBase();
const prodOauthPendingDir = path.join(TMP, 'oauth-pending-field');
const prodOauthPendingPath = write(
  path.join('oauth-pending-field', 'settings.json'),
  prodOauthPendingField,
  true
);
writeOauthDoc(
  prodOauthPendingDir,
  OAUTH_COMPLETE_PROD.replace('Synthetic federation setup approved', 'PENDING').replace(
    'synthetic federation setup approved',
    'PENDING'
  )
);
const t66 = run(['--mode', 'production', prodOauthPendingPath]);
check('66 production mode rejects OAuth doc with a PENDING field', t66.code, 1);
check(
  "67 production mode reports OAuth field 'Migration trigger' unresolved",
  t66.stdout.includes(`oauth-token-management field 'Migration trigger' is unresolved`),
  true
);

// 68: template mode still accepts the repository's real internal-beta-only
// OAuth decision â€” beta scope is a warning gate, not a hard failure, until
// production mode is requested.
const t68 = run(['--mode', 'template', path.join(REPO_ROOT, 'managed-settings.json')]);
check('68 template mode still passes with internal-beta OAuth status', t68.code, 0);

// 69: a direct "Status:" line is normalised before positive approval checks.
const prodOauthDirectStatus = prodBase();
const prodOauthDirectStatusDir = path.join(TMP, 'oauth-direct-status');
const prodOauthDirectStatusPath = write(
  path.join('oauth-direct-status', 'settings.json'),
  prodOauthDirectStatus,
  true
);
writeOauthDoc(prodOauthDirectStatusDir, OAUTH_COMPLETE_PROD_STATUS_LINE);
const t69 = run(['--mode', 'production', prodOauthDirectStatusPath]);
check('69 production mode accepts direct OAuth Status line', t69.code, productionExit);

// 70: direct "Status: NOT APPROVED" must still fail under the normalised parser.
const prodOauthDirectNegative = prodBase();
const prodOauthDirectNegativeDir = path.join(TMP, 'oauth-direct-negative');
const prodOauthDirectNegativePath = write(
  path.join('oauth-direct-negative', 'settings.json'),
  prodOauthDirectNegative,
  true
);
writeOauthDoc(
  prodOauthDirectNegativeDir,
  OAUTH_COMPLETE_PROD_STATUS_LINE.replace(
    'APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE',
    'NOT APPROVED â€” synthetic'
  )
);
const t70 = run(['--mode', 'production', prodOauthDirectNegativePath]);
check('70 production mode rejects direct negative OAuth Status line', t70.code, 1);
check(
  '71 production mode reports direct negative OAuth status',
  t70.stdout.includes('oauth-token-management status is not APPROVED'),
  true
);

// 72: direct "Status: APPROVED FOR INTERNAL BETA ONLY" must still fail production.
const prodOauthDirectBeta = prodBase();
const prodOauthDirectBetaDir = path.join(TMP, 'oauth-direct-beta');
const prodOauthDirectBetaPath = write(
  path.join('oauth-direct-beta', 'settings.json'),
  prodOauthDirectBeta,
  true
);
writeOauthDoc(
  prodOauthDirectBetaDir,
  OAUTH_COMPLETE_PROD_STATUS_LINE.replace(
    'APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE',
    'APPROVED FOR INTERNAL BETA ONLY â€” synthetic'
  )
);
const t72 = run(['--mode', 'production', prodOauthDirectBetaPath]);
check('72 production mode rejects direct internal-beta OAuth Status line', t72.code, 1);
check(
  '73 production mode reports direct internal-beta OAuth status',
  t72.stdout.includes('oauth-token-management status is not approved for production'),
  true
);

// 74: "## Status" followed by a "Status: APPROVED ..." candidate must normalise.
const prodOauthHeadingDirect = prodBase();
const prodOauthHeadingDirectDir = path.join(TMP, 'oauth-heading-direct');
const prodOauthHeadingDirectPath = write(
  path.join('oauth-heading-direct', 'settings.json'),
  prodOauthHeadingDirect,
  true
);
writeOauthDoc(
  prodOauthHeadingDirectDir,
  `# Policy decision: OAuth token management for Claude workflows

## Status

Status: APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE

${OAUTH_DECISION_RECORD}`
);
const t74 = run(['--mode', 'production', prodOauthHeadingDirectPath]);
check('74 production mode accepts Status under ## Status heading', t74.code, productionExit);

// 75: expert-report direct "Status: NOT APPROVED" must fail the anchored check.
function writeExpertDoc(dir, content) {
  const target = path.join(dir, 'docs', 'policy-decisions', 'expert-report-rule.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const prodExpertNegative = prodBase();
const prodExpertNegativeDir = path.join(TMP, 'expert-direct-negative');
const prodExpertNegativePath = write(
  path.join('expert-direct-negative', 'settings.json'),
  prodExpertNegative,
  true
);
writeExpertDoc(
  prodExpertNegativeDir,
  `# Policy decision: expert-report rule

Status: NOT APPROVED â€” synthetic

## Decision

Synthetic expert-report negative-status fixture.
`
);
const t75 = run(['--mode', 'production', prodExpertNegativePath]);
check('75 production mode rejects direct negative expert-report status', t75.code, 1);
check(
  '76 production mode reports direct negative expert-report status',
  t75.stdout.includes('expert-report rule status is not APPROVED'),
  true
);

// ---- quiet flag --------------------------------------------------------------

// 80-81: quiet flag suppresses warnings and notes
const tQuietTemplate = run(['--mode', 'template', '--quiet', templatePath]);
check('80 quiet flag suppresses warnings', !tQuietTemplate.stdout.includes('WARNING:'), true);
check('81 quiet flag still passes', tQuietTemplate.code, 0);

// 82: quiet flag suppresses note in production mode
const tQuietProduction = run(['--mode', 'production', '--quiet', prodGoodPath]);
check('82 quiet flag suppresses production note', !tQuietProduction.stdout.includes('engineering readiness gate'), true);

// 83: production mode reports a note without quiet
const tProductionNote = run(['--mode', 'production', prodGoodPath]);
check('83 production mode reports note without quiet', tProductionNote.stdout.includes('engineering readiness gate'), productionExit === 0);

// ---- committed template / synthetic fixture ---------------------------------

// 84: committed managed-settings.json passes template mode
const tCommittedTemplate = run(['--mode', 'template', path.join(REPO_ROOT, 'managed-settings.json')]);
check('84 committed template passes template mode', tCommittedTemplate.code, 0);

// 85: committed template fails production mode (placeholders present)
const tCommittedProduction = run(['--mode', 'production', path.join(REPO_ROOT, 'managed-settings.json')]);
check('85 committed template fails production mode', tCommittedProduction.code, 1);

// 86: committed synthetic-production.json passes production mode
const relativeEvidenceRoot = path.join(TMP, 'current-synthetic-evidence');
copyEvidence(relativeEvidenceRoot);
const tSyntheticProduction = run([
  '--mode', 'production', path.join(REPO_ROOT, 'test-fixtures', 'synthetic-production.json'),
  '--evidence-root', relativeEvidenceRoot,
]);
check('86 synthetic fixture passes production mode', tSyntheticProduction.code, productionExit);

// 87: mutation test rejects an invalid non-placeholder root
const prodBadRoot = prodBase();
prodBadRoot.env.CLAUDE_MATTER_ROOTS = 'relative-matter-root';
const prodBadRootPath = write('prod-bad-root.json', prodBadRoot, true);
const tBadRoot = run(['--mode', 'production', prodBadRootPath]);
check('87 production mode rejects invalid root', tBadRoot.code, 1);
check('88 production mode reports invalid root', tBadRoot.stdout.includes('CLAUDE_MATTER_ROOTS root is not an absolute POSIX path'), true);

// ---- cleanup ----------------------------------------------------------------
for (const [label, mutate, expected] of [
  ['filtered matcher', d => { d.hooks.PreToolUse[0].matcher = 'Read'; }, 'must match all events'],
  ['async hook', d => { d.hooks.PreToolUse[0].hooks[0].async = true; }, 'synchronous command hook'],
  ['all hooks disabled', d => { d.disableAllHooks = true; }, 'disableAllHooks must be false'],
  ['wrong interpreter', d => { d.hooks.PreToolUse[0].hooks[0].command = HOOK.replace('node', 'echo'); }, 'does not invoke matter-guard.js'],
  ['malformed hook list', d => { d.hooks.PreToolUse[0].hooks = 42; }, 'non-empty array'],
  ['hook shell expansion', d => { d.hooks.PreToolUse[0].hooks[0].command = 'node "/tmp/$(touch injected)/matter-guard.js"'; }, 'does not invoke matter-guard.js'],
  ['non-object document', () => [], 'settings must be a JSON object'],
  ['nested placeholder', d => { d.permissions.deny.push('Read(REPLACE-WITH-PATH)'); }, 'unresolved REPLACE-WITH placeholder at settings.permissions.deny'],
  ['filesystem root', d => { d.env.CLAUDE_MATTER_ROOTS = '/'; }, 'not an absolute POSIX path'],
  ['global read', d => { d.sandbox.filesystem.allowRead.push('/'); }, 'allowRead must be a non-empty array'],
  ['sibling read', d => { d.sandbox.filesystem.allowRead.push('/synthetic-matters/Jones'); }, 'sandbox allowRead exposes a parent or sibling'],
  ['two writable matters', d => { d.sandbox.filesystem.allowWrite.push('/synthetic-matters/Jones'); }, 'exactly one matter'],
  ['wrong guard root', d => { d.env.CLAUDE_MATTER_ROOTS = '/synthetic-matters/Smith'; }, 'immediate child'],
  ['home-only denial', d => { d.sandbox.filesystem.denyRead = ['~']; }, "denying '~' alone"],
  ['filesystem isolation disabled', d => { d.sandbox.filesystem.disabled = true; }, 'filesystem.disabled must be false'],
  ['subprocess credential scrub missing', d => { delete d.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB; }, 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB must be'],
  ['wildcard domain', d => { d.sandbox.network.allowedDomains = ['*']; }, 'exact hostnames'],
  ['Unix sockets bypass', d => { d.sandbox.network.allowAllUnixSockets = true; }, 'Unix socket access must be disabled'],
  ['missing credentials', d => { delete d.sandbox.credentials; }, 'credentials.files must contain deny entries'],
  ['credential allow', d => { d.sandbox.credentials.files[0].mode = 'allow'; }, 'credentials.files must contain deny entries'],
  ['content logging inherited', d => { delete d.env.OTEL_LOG_TOOL_CONTENT; }, 'OTEL_LOG_TOOL_CONTENT must explicitly'],
  ['old telemetry bypass version', d => { d.requiredMinimumVersion = '2.1.250'; }, 'must be at least 2.1.251'],
  ['version trailing junk', d => { d.requiredMaximumVersion = '2.1.300junk'; }, 'not a valid version'],
  ['inverted versions', d => { d.requiredMinimumVersion = '2.1.301'; }, 'exceeds requiredMaximumVersion'],
  ['empty HTTPS host', d => { d.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://'; }, 'must start with https://'],
  ['OTLP query', d => { d.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://collector.example.invalid?synthetic=1'; }, 'must start with https://'],
  ['OTLP signal endpoint', d => { d.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://collector.example.invalid/v1/traces'; }, 'must start with https://'],
]) {
  const fixture = prodBase();
  const returned = mutate(fixture);
  const candidatePath = write(`adversarial/${label}.json`, returned === undefined ? fixture : returned, true);
  const result = run(['--mode', 'production', candidatePath]);
  check(`${label} rejected`, result.code, 1);
  check(`${label} identified specifically`, result.stdout.includes(expected), true);
  check(`${label} does not crash`, result.stderr.includes('Traceback'), false);
}
// Evidence must be deliberately selected, not picked up next to an artefact.
const implicitEvidence = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
  [SCRIPT, '--mode', 'production', prodGoodPath], { encoding: 'utf8' });
check('adjacent synthetic evidence cannot shadow repository registers', implicitEvidence.stdout.includes('governance register unresolved'), true);
const badDatePath = write('bad-date/settings.json', prodBase(), true);
const badDateRegister = path.join(TMP, 'bad-date/docs/operational-evidence-register.md');
fs.writeFileSync(badDateRegister, fs.readFileSync(badDateRegister, 'utf8').replace(shiftedDate(-1), '2026-02-30'));
const badDate = run(['--mode', 'production', badDatePath]);
check('impossible evidence date is rejected', badDate.stdout.includes('date is not an ISO date'), true);
for (const [register, removed, expected] of [
  ['supplier-evidence-register.md', 'Inputs and outputs are not used to train any model', 'supplier evidence register must contain exactly one entry'],
  ['legal-source-register.md', 'Federal Court general practice note', 'legal source register must contain exactly one entry'],
]) {
  const candidate = write(`removed-${register}/settings.json`, prodBase(), true);
  const registerPath = path.join(path.dirname(candidate), 'docs', register);
  fs.writeFileSync(registerPath, fs.readFileSync(registerPath, 'utf8').split('\n').filter(line => !line.includes(removed)).join('\n'));
  check(`deleted ${register} gate rejected`, run(['--mode', 'production', candidate]).stdout.includes(expected), true);
}
const byteFailure = path.join(TMP, 'invalid-utf8.json');
fs.writeFileSync(byteFailure, Buffer.from([0xff, 0xfe, 0xff]));
const invalidUtf8 = run(['--mode', 'template', byteFailure]);
check('invalid UTF-8 fails usefully', invalidUtf8.code === 1 && invalidUtf8.stdout.includes('ERROR:') && !invalidUtf8.stderr.includes('Traceback'), true);
// Exercise currency/ordering through the CLI, whose clock always uses UTC now.
for (const [label, register, change, expected] of [
  ['supplier review expired', 'supplier-evidence-register.md', text => text.replace(shiftedDate(364), shiftedDate(-2)), 'review is overdue'],
  ['legal review expired', 'legal-source-register.md', text => text.replace(shiftedDate(364), shiftedDate(-2)), 'review is overdue'],
  ['supplier future verification', 'supplier-evidence-register.md', text => text.replace(shiftedDate(-1), shiftedDate(7)), 'completed date is in the future'],
  ['legal future verification', 'legal-source-register.md', text => text.replace(shiftedDate(-1), shiftedDate(7)), 'completed date is in the future'],
  ['supplier reverse review dates', 'supplier-evidence-register.md', text => text.replace(shiftedDate(-1), shiftedDate(3)).replace(shiftedDate(364), shiftedDate(2)), 'due date precedes its completed date'],
  ['legal reverse review dates', 'legal-source-register.md', text => text.replace(shiftedDate(-1), shiftedDate(3)).replace(shiftedDate(364), shiftedDate(2)), 'due date precedes its completed date'],
  ['token rotation overdue', 'policy-decisions/oauth-token-management.md', text => text.replace(shiftedDate(89), shiftedDate(-2)), 'rotation is overdue'],
  ['token future rotation', 'policy-decisions/oauth-token-management.md', text => text.replace(`Last rotated: ${shiftedDate(-1)}`, `Last rotated: ${shiftedDate(7)}`), 'rotation completed date is in the future'],
  ['token future approval', 'policy-decisions/oauth-token-management.md', text => text.replace(`Date: ${shiftedDate(-1)}`, `Date: ${shiftedDate(7)}`), 'approval date is in the future'],
  ['token reverse rotation dates', 'policy-decisions/oauth-token-management.md', text => text.replace(`Last rotated: ${shiftedDate(-1)}`, `Last rotated: ${shiftedDate(3)}`).replace(shiftedDate(89), shiftedDate(2)), 'rotation due date precedes its completed date'],
  ['future operational observation', 'operational-evidence-register.md', text => text.replace(shiftedDate(-1), shiftedDate(7)), 'date is in the future'],
  ['future data-flow signoff', 'data-flow-model.md', text => text.replace(shiftedDate(-1), shiftedDate(7)), 'date is in the future'],
  ['missing legal interpretation', 'legal-source-register.md', text => text.replace('Synthetic interpretation for tests.', ''), 'approved interpretation is unresolved'],
  ['unapproved legal interpretation', 'legal-source-register.md', text => text.replace('Synthetic interpretation for tests.', 'NOT APPROVED'), 'approved interpretation is unresolved'],
  ['placeholder supplier source URL', 'supplier-evidence-register.md', text => text.replace('https://docs.anthropic.com/en/legal/ai-data-policy', 'https://REPLACE-WITH-SOURCE'), 'source URL is not http(s)'],
  ['empty supplier source host', 'supplier-evidence-register.md', text => text.replace('https://docs.anthropic.com/en/legal/ai-data-policy', 'https://'), 'source URL is not http(s)'],
]) {
  const fixture = write(`currency-${label}/settings.json`, prodBase(), true);
  const evidence = path.join(path.dirname(fixture), 'docs', register);
  fs.writeFileSync(evidence, change(fs.readFileSync(evidence, 'utf8')));
  const result = run(['--mode', 'production', fixture]);
  check(`${label} rejected`, result.code, 1);
  check(`${label} identified`, result.stdout.includes(expected), true);
}
// Disabling an optional integration needs a positive, current observation;
// absent secrets or variables never replace the active credential gate.
const workflowDigest = createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT,
  '.github/workflows/claude.yml'), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const workflowOrigin = spawnSync('git', ['config', '--get', 'remote.origin.url'],
  { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
const workflowRepository = workflowOrigin.replace(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)/, '').replace(/\.git$/, '');
const disabledObservation = `### Current workflow disposition

Status: DISABLED

- Workflow state: disabled_manually
- Workflow path: .github/workflows/claude.yml
- Workflow ID: 322652643
- Repository: ${workflowRepository}
- Workflow SHA-256 (LF): ${workflowDigest}
- Evidence source: https://api.github.com/repos/${workflowRepository}/actions/workflows/claude.yml
- Observed by: Synthetic test observer
- Verified date: ${UTC_DAY}

### Refresh before release

Historical text below this boundary must not supply missing current fields.
`;
function disabledResult(label, observation) {
  const fixture = write(`workflow-${label}/settings.json`, prodBase(), true);
  writeOauthDoc(path.dirname(fixture), `# OAuth history\n\nStatus: APPROVED FOR INTERNAL BETA ONLY\n\n- Last rotated: never rotated\n- Next rotation due: 2020-01-01\n\n${observation}`);
  return run(['--mode', 'production', fixture]);
}
const disabledGood = disabledResult('current', disabledObservation);
check('current explicit disabled workflow releases optional token gate', disabledGood.code, productionExit);
check('disabled workflow has no unrelated errors', (disabledGood.stdout.match(/^ERROR:/gm) || []).length, productionExit);
for (const [label, change, expected] of [
  ['active state', t => t.replace('Workflow state: disabled_manually', 'Workflow state: active'), 'observed disabled_manually state'],
  ['wrong path', t => t.replace('Workflow path: .github/workflows/claude.yml', 'Workflow path: .github/workflows/ci.yml'), 'workflow path must be'],
  ['wrong ID', t => t.replace('Workflow ID: 322652643', 'Workflow ID: not-a-number'), 'ID must be a positive integer'],
  ['wrong repository', t => t.replace(`Repository: ${workflowRepository}`, 'Repository: synthetic/unrelated'), 'does not match this checkout'],
  ['wrong source', t => t.replace('Evidence source: https://api.github.com/', 'Evidence source: https://unrelated.example.invalid/'), 'must identify this workflow'],
  ['stale hash', t => t.replace(workflowDigest, '0'.repeat(64)), 'hash does not match'],
  ['old observation', t => t.replace(`Verified date: ${UTC_DAY}`, `Verified date: ${shiftedDate(-1)}`), 'current UTC assessment date'],
  ['future observation', t => t.replace(`Verified date: ${UTC_DAY}`, `Verified date: ${shiftedDate(7)}`), 'current UTC assessment date'],
  ['missing observer', t => t.replace('- Observed by: Synthetic test observer\n', ''), "field 'Observed by' is unresolved"],
  ['blank observer', t => t.replace('Observed by: Synthetic test observer', 'Observed by:'), "field 'Observed by' is unresolved"],
  ['placeholder source', t => t.replace('Observed by: Synthetic test observer', 'Observed by: PENDING'), "field 'Observed by' is unresolved"],
  ['duplicate field', t => t.replace('- Workflow state: disabled_manually', '- Workflow state: disabled_manually\n- Workflow state: active'), "field 'Workflow state' is unresolved"],
  ['missing status', t => t.replace('Status: DISABLED', ''), 'has no status line'],
  ['duplicate section', t => t + t, 'current workflow disposition is duplicated'],
]) {
  const result = disabledResult(label, change(disabledObservation));
  check(`disabled ${label} rejected`, result.code, 1);
  check(`disabled ${label} identified`, result.stdout.includes(expected), true);
}
const activeCurrent = disabledResult('active approved', `### Current workflow disposition\n\nStatus: APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE\n\n${OAUTH_DECISION_RECORD.replace('## Decision record', '#### Decision record')}`);
check('current approved credentials still support active workflow', (activeCurrent.stdout.match(/^ERROR:/gm) || []).length, productionExit);
const boldCurrent = disabledResult('bold labels', disabledObservation.replace(/^- ([^:\n]+): /gm, '- **$1:** '));
check('standard bold decision fields parse without bypass', (boldCurrent.stdout.match(/^ERROR:/gm) || []).length, productionExit);
// Pin the clock internally for deterministic boundary tests; there is no CLI
// clock override that could make an expired production approval look current.
const dateBoundaries = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', `
import datetime as dt, importlib.util, pathlib, sys
script = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(script.parent))
spec = importlib.util.spec_from_file_location('preflight', script)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)
as_of = dt.date(2040, 2, 29)
assert not preflight._review_date_issues('2040-02-28', '2040-02-29', 'review', as_of)
assert not preflight._review_date_issues('2040-02-29', '2040-03-01', 'review', as_of)
assert any('overdue' in issue for issue in preflight._review_date_issues('2040-02-27', '2040-02-28', 'review', as_of))
assert any('future' in issue for issue in preflight._review_date_issues('2040-03-01', '2040-03-02', 'review', as_of))
assert any('precedes' in issue for issue in preflight._review_date_issues('2040-03-02', '2040-03-01', 'review', as_of))
fixtures = script.parent.parent / 'test-fixtures' / 'docs'
supplier = (fixtures / 'supplier-evidence-register.md').read_text(encoding='utf-8')
assert not preflight._validate_supplier_evidence_register(supplier, dt.date(2026, 9, 7))
assert any('overdue' in issue for issue in preflight._validate_supplier_evidence_register(supplier, dt.date(2028, 1, 1)))
legal = (fixtures / 'legal-source-register.md').read_text(encoding='utf-8')
assert any('future' in issue for issue in preflight._validate_legal_source_register(legal, dt.date(2026, 8, 3)))
oauth = (fixtures / 'policy-decisions' / 'oauth-token-management.md').read_text(encoding='utf-8')
assert not preflight._validate_oauth_token_management(oauth, 'production', dt.date(2026, 11, 2))
assert any('overdue' in issue for issue in preflight._validate_oauth_token_management(oauth, 'production', dt.date(2026, 11, 3)))
`, SCRIPT], { encoding: 'utf8' });
check('UTC expiry boundaries and leap dates are deterministic', dateBoundaries.status, 0);
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail > 0 ? 1 : 0);
