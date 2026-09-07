#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname + '/..';
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let passed = 0;
let failed = 0;

function ok(name, condition, detail) {
  if (condition) {
    console.log(`PASS  ${name}${detail ? '  ' + detail : ''}`);
    passed += 1;
  } else {
    console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`);
    failed += 1;
  }
}

const hook = read('hooks/matter-guard.js');
const readme = read('README.md');
const security = read('SECURITY.md');
const architecture = read('docs/production-architecture.md');
const settings = JSON.parse(read('managed-settings.json'));
const ci = read('.github/workflows/ci.yml');

ok(
  'hook header no longer claims fixed tool list',
  !hook.includes('The tool list below is fixed'),
  'header matches wildcard matcher posture'
);

ok(
  'hook code still denies unknown tools',
  hook.includes("caps.type === 'unknown'") && hook.includes('unknown tool:'),
  'default-deny remains executable behaviour'
);

ok(
  'README no longer claims fixed tool list',
  !readme.includes('The tool list is fixed.') && !readme.includes('The guard covers a fixed list of file tools.'),
  'README matches wildcard matcher posture'
);

ok(
  'SECURITY no longer claims fixed tool list',
  !security.includes('covers a fixed list of file tools') && !security.includes('| Fixed tool list in the guard |'),
  'SECURITY matches wildcard matcher posture'
);

ok(
  'README no longer claims forceLoginOrgUUID is absent',
  !readme.includes('forceLoginOrgUUID is not in the file') && settings.forceLoginOrgUUID,
  'template key is present and documented as a placeholder'
);

ok(
  'README does not claim shipped template gives per-matter Bash isolation',
  readme.includes('without a per-matter `sandbox.filesystem` policy') &&
    readme.includes('Bash is confined by working directory only') &&
    readme.includes('scripts/generate-matter-sandbox.py'),
  'README keeps the hard-boundary caveat explicit while acknowledging the generator'
);

ok(
  'production architecture does not claim repo ships a launcher',
  architecture.includes('does **not** ship a launcher') || architecture.includes('does not ship a launcher'),
  'launcher remains outside the repo boundary'
);

ok(
  'managed settings remain template posture',
  settings.env && settings.env.CLAUDE_MATTER_MODE === 'warn' && settings.sandbox && settings.sandbox.enabled === true && settings.sandbox.failIfUnavailable === false && !('filesystem' in settings.sandbox),
  'docs should describe this as template, not production isolation'
);

ok(
  'CI runs the docs control claims test',
  ci.includes('docs-control-claims.test.js'),
  'drift test wired into CI'
);

// A test suite is not host acceptance evidence or independent certification.
ok(
  'README does not assert completed isolation certification',
  !/only the Linux container path[^.\n]*(?:is|are) \*?\*?certified/i.test(readme) &&
    !/path is certified for hard matter isolation/i.test(readme),
  'supported designs must be distinguished from observed host acceptance'
);
ok(
  'architecture requires target-host acceptance',
  architecture.includes('os-isolation-acceptance.md') && /acceptance/i.test(architecture),
  'real operating-system containment remains an explicit deployment gate'
);
ok(
  'security documents native Windows isolation limit',
  /Native Windows/i.test(security) && /(?:unsupported|no equivalent OS sandbox|no OS-level sandbox)/i.test(security),
  'native Windows must not be presented as hard isolation'
);
const workflow = read('.github/workflows/claude.yml');
ok('optional Claude workflow requires explicit opt-in',
  workflow.includes("vars.ENABLE_CLAUDE_WORKFLOW == 'true'"));
ok('optional Claude workflow checks actor write access before checkout',
  workflow.indexOf('Verify invoking actor has repository write access') < workflow.indexOf('Checkout repository') &&
  workflow.includes('collaborators/$ACTOR/permission') && workflow.includes('admin|maintain|write'));
ok('optional Claude workflow cannot mint a broader app token',
  workflow.includes('github_token: ${{ github.token }}') && !workflow.includes('id-token: write'));
ok('CI invokes the documented full verification runner', ci.includes('python scripts/verify.py'));
console.log(`\npassed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
