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

const SCRIPT = path.join(__dirname, '..', 'scripts', 'preflight-validate.py');
const REPO_ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
const HOOK = 'node "${REPO_ROOT}/hooks/matter-guard.js"';

// Resolved governance registers, copied next to production fixtures so the
// happy path does not fail on the repo-root registers (which are deliberately
// unresolved in the template).
const REGISTER_DIR = path.join(REPO_ROOT, 'test-fixtures', 'docs');

function copyRegisters(destDir) {
  const target = path.join(destDir, 'docs');
  fs.mkdirSync(path.join(target, 'policy-decisions'), { recursive: true });
  fs.copyFileSync(
    path.join(REGISTER_DIR, 'supplier-evidence-register.md'),
    path.join(target, 'supplier-evidence-register.md')
  );
  fs.copyFileSync(
    path.join(REGISTER_DIR, 'policy-decisions', 'expert-report-rule.md'),
    path.join(target, 'policy-decisions', 'expert-report-rule.md')
  );
  fs.copyFileSync(
    path.join(REGISTER_DIR, 'policy-decisions', 'oauth-token-management.md'),
    path.join(target, 'policy-decisions', 'oauth-token-management.md')
  );
  fs.copyFileSync(
    path.join(REGISTER_DIR, 'legal-source-register.md'),
    path.join(target, 'legal-source-register.md')
  );
  fs.copyFileSync(
    path.join(REGISTER_DIR, 'data-flow-model.md'),
    path.join(target, 'data-flow-model.md')
  );
}

function run(args, env) {
  const r = spawnSync('python3', [SCRIPT, ...args], {
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
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_LOGS_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://synthetic-otel.example.invalid:4318',
      CLAUDE_MATTER_ROOTS: '/synthetic-matters/Smith;/synthetic-matters/Jones',
      CLAUDE_MATTER_MODE: 'enforce',
    },
    requiredMinimumVersion: '2.1.219',
    requiredMaximumVersion: '2.1.300',
    forceLoginMethod: 'claudeai',
    forceLoginOrgUUID: '00000000-0000-4000-8000-000000000001',
    allowManagedHooksOnly: true,
    allowManagedMcpServersOnly: true,
    forceRemoteSettingsRefresh: true,
    disableArtifact: true,
    disableRemoteControl: true,
    allowedMcpServers: [],
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
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        allowManagedReadPathsOnly: true,
        denyRead: ['/', '~'],
        allowRead: ['/synthetic-matters/Smith', '/synthetic-matters/Jones', '/usr/bin', '/opt/claude'],
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
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
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
check('20 production mode accepts valid production file', t20.code, 0);
check('21 production mode reports PASS', t20.stdout.includes('PASS: production preconditions met'), true);
check('22 production mode reports note', t20.stdout.includes('engineering readiness gate'), true);

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
check('43 production mode reports denyRead error', t42.stdout.includes("denyRead must include '/' or '~'"), true);

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

// 48: production mode rejects unresolved governance register
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

// ---- OAuth governance register: scope-aware, positive field validation -----

function writeOauthDoc(dir, content) {
  const target = path.join(dir, 'docs', 'policy-decisions', 'oauth-token-management.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const OAUTH_DECISION_RECORD = `## Decision record

- Decision: Option B — synthetic static-token exception
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
`;

const OAUTH_COMPLETE_PROD = `# Policy decision: OAuth token management for Claude workflows

## Status

APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE

${OAUTH_DECISION_RECORD}`;

const OAUTH_COMPLETE_PROD_STATUS_LINE = `# Policy decision: OAuth token management for Claude workflows

Status: APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE

${OAUTH_DECISION_RECORD}`;

// 60: production mode rejects an internal-beta-only OAuth status even when
// every operational field is filled — beta approval must never satisfy a
// production gate.
const prodOauthBeta = prodBase();
const prodOauthBetaDir = path.join(TMP, 'oauth-beta');
const prodOauthBetaPath = write(path.join('oauth-beta', 'settings.json'), prodOauthBeta, true);
writeOauthDoc(
  prodOauthBetaDir,
  OAUTH_COMPLETE_PROD.replace(
    'APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE',
    'APPROVED FOR INTERNAL BETA ONLY — synthetic'
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
    'NOT APPROVED — synthetic'
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
// OAuth decision — beta scope is a warning gate, not a hard failure, until
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
check('69 production mode accepts direct OAuth Status line', t69.code, 0);

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
    'NOT APPROVED — synthetic'
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
    'APPROVED FOR INTERNAL BETA ONLY — synthetic'
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
check('74 production mode accepts Status under ## Status heading', t74.code, 0);

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

Status: NOT APPROVED — synthetic

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

// 50-51: quiet flag suppresses warnings and notes
const t50 = run(['--mode', 'template', '--quiet', templatePath]);
check('50 quiet flag suppresses warnings', !t50.stdout.includes('WARNING:'), true);
check('51 quiet flag still passes', t50.code, 0);

// 52: quiet flag suppresses note in production mode
const t52 = run(['--mode', 'production', '--quiet', prodGoodPath]);
check('52 quiet flag suppresses production note', !t52.stdout.includes('engineering readiness gate'), true);

// 53: production mode reports a note without quiet
const t53 = run(['--mode', 'production', prodGoodPath]);
check('53 production mode reports note without quiet', t53.stdout.includes('engineering readiness gate'), true);

// ---- committed template / synthetic fixture ---------------------------------

// 54: committed managed-settings.json passes template mode
const t54 = run(['--mode', 'template', path.join(REPO_ROOT, 'managed-settings.json')]);
check('54 committed template passes template mode', t54.code, 0);

// 55: committed template fails production mode (placeholders present)
const t55 = run(['--mode', 'production', path.join(REPO_ROOT, 'managed-settings.json')]);
check('55 committed template fails production mode', t55.code, 1);

// 56: committed synthetic-production.json passes production mode
const t56 = run([
  '--mode', 'production', path.join(REPO_ROOT, 'test-fixtures', 'synthetic-production.json'),
]);
check('56 synthetic fixture passes production mode', t56.code, 0);

// 57: mutation test rejects an invalid non-placeholder root
const prodBadRoot = prodBase();
prodBadRoot.env.CLAUDE_MATTER_ROOTS = 'relative-matter-root';
const prodBadRootPath = write('prod-bad-root.json', prodBadRoot, true);
const t57 = run(['--mode', 'production', prodBadRootPath]);
check('57 production mode rejects invalid root', t57.code, 1);
check('58 production mode reports invalid root', t57.stdout.includes('CLAUDE_MATTER_ROOTS root is not an absolute POSIX path'), true);

// ---- cleanup ----------------------------------------------------------------
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail > 0 ? 1 : 0);