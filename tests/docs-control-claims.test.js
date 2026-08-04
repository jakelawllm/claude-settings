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

console.log(`\npassed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
