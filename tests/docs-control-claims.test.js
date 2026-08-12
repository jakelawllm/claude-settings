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

// -- certified platform claims must not drift between README and architecture --

// The README must NOT advise relying on macOS-with-Claude-sandbox-alone as a
// certified hard matter isolation path in this release. The architecture doc
// is the authority: macOS is an open question, not certified.
ok(
  'README does not certify macOS sandbox-alone as a hard matter boundary',
  !readme.includes('Use macOS, Linux, or Windows with Claude Code inside WSL2 if the boundary needs to hold'),
  'README must not list macOS among certified hard-boundary platforms'
);

ok(
  'README distinguishes macOS sandbox availability from certification',
  /macOS[^.]*open question/i.test(readme) && /not certified in this release/i.test(readme),
  'README must distinguish availability of the macOS sandbox from certification'
);

ok(
  'README names the Linux container and WSL2 path as the only certified path',
  /Linux container path and WSL2 running the same container path are \*certified\*/i.test(readme) ||
    /only the Linux container path and WSL2 running the same container path are/i.test(readme),
  'README must name the certified production path explicitly'
);

// README and production-architecture.md must agree on the certified platform
// set. If architecture certifies a platform the README does not name, or vice
// versa, the two have drifted.
const archCertifiedLinux = /Linux container.*Certified|Certified.*Linux container/i.test(architecture);
const archCertifiedWsl = /WSL2.*Certified|Certified.*WSL2/i.test(architecture);
const archMacOpenQuestion = /macOS.*Open question|Open question.*macOS/i.test(architecture);
const archWindowsUnsupported = /Native Windows.*Unsupported|Unsupported.*Native Windows/i.test(architecture);
ok(
  'production-architecture certified platform table is intact',
  archCertifiedLinux && archCertifiedWsl && archMacOpenQuestion && archWindowsUnsupported,
  'architecture table still classifies Linux container / WSL2 certified, macOS open, Windows unsupported'
);

// The README go/no-go red checklist must steer the reader to the certified
// path rather than to macOS as a default.
ok(
  'README red checklist steers to the certified path, not macOS-as-default',
  /where the boundary needs to hold, use the certified path/i.test(readme),
  'red checklist points at the certified path'
);

// The README Status section must state the macOS open-question position so a
// reader who skims to the end sees it.
ok(
  'README Status section states macOS is not certified in this release',
  /macOS with Claude sandbox alone is an open question and is not certified in this release/i.test(readme),
  'Status section records the macOS certification position'
);

console.log(`\npassed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
