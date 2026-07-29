/**
 * Tests for hooks/matter-guard.js.
 *
 *   node tests/matter-guard.test.js hooks/matter-guard.js
 *
 * The hook is driven as a child process with real JSON payloads, deliberately:
 * an earlier shell-based harness reported false passes twice, once because a
 * synchronous stdin read throws on Windows and once because asynchronous
 * stdout writes were lost through command substitution. Both failures looked
 * like "allowed", which is the dangerous direction for a control of this kind.
 *
 * Cases 2 and 11 are regressions for bugs this harness found: the same matter
 * reached by a second alias was denied, and a path leaving the bound matter
 * via ".." was allowed.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const HOOK = process.argv[2] || 'hooks/matter-guard.js';
const ROOT = '\\\\nas.example.invalid\\matters';
const ALIAS = '\\\\nas-alias.example.invalid\\matters';

const env = {
  ...process.env,
  CLAUDE_MATTER_ROOTS: [ROOT, ALIAS, 'Z:\\matters'].join(';'),
};

const stateDir = path.join(process.env.LOCALAPPDATA, 'claude-matter-guard');
fs.rmSync(stateDir, { recursive: true, force: true });

function call(ev) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(ev),
    encoding: 'utf8',
    env,
  });
  if (r.stderr && r.stderr.trim()) console.log('   stderr:', r.stderr.trim());
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { _raw: r.stdout };
  }
}

function pre(session, tool, target, cwd) {
  const key = tool === 'Grep' || tool === 'Glob' ? 'path' : 'file_path';
  return call({
    hook_event_name: 'PreToolUse',
    session_id: session,
    tool_name: tool,
    tool_input: { [key]: target },
    cwd,
  });
}

const decision = (o) =>
  (o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision) || 'allow';

let pass = 0;
let fail = 0;
function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} want=${want.padEnd(5)} got=${got}`
  );
}

const SMITH = ROOT + '\\Smith';
const JONES = ROOT + '\\Jones';

check('1 first touch binds Smith', decision(pre('s1', 'Read', SMITH + '\\brief.docx', SMITH)), 'allow');
check('2 same matter via second alias', decision(pre('s1', 'Read', ALIAS + '\\Smith\\adv.docx', SMITH)), 'allow');
check('3 second matter Jones', decision(pre('s1', 'Read', JONES + '\\f.docx', SMITH)), 'deny');
check('4 second matter, mapped drive', decision(pre('s1', 'Grep', 'Z:\\matters\\Jones', SMITH)), 'deny');
check('5 second matter, \\\\?\\UNC form', decision(pre('s1', 'Read', '\\\\?\\UNC\\nas.example.invalid\\matters\\Jones\\f.docx', SMITH)), 'deny');
check('6 case variant, same matter', decision(pre('s1', 'Read', ROOT.toUpperCase() + '\\SMITH\\x.docx', SMITH)), 'allow');
check('7 non-client path', decision(pre('s1', 'Read', 'C:\\Users\\jacob\\notes.md', SMITH)), 'allow');
check('8 lookalike sibling root', decision(pre('s1', 'Read', ROOT + '-old\\Jones\\f.docx', SMITH)), 'allow');
check('9 Write into second matter', decision(pre('s1', 'Write', JONES + '\\new.txt', SMITH)), 'deny');
check('10 separate session, own matter', decision(pre('s2', 'Read', JONES + '\\f.docx', JONES)), 'allow');
check('11 traversal out of bound matter', decision(pre('s1', 'Read', SMITH + '\\..\\Jones\\f.docx', SMITH)), 'deny');

// Fail-closed: installed but unconfigured must refuse, not quietly allow.
{
  const bare = { ...process.env };
  delete bare.CLAUDE_MATTER_ROOTS;
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 's3',
      tool_name: 'Read',
      tool_input: { file_path: 'C:\\anything.txt' },
      cwd: 'C:\\tmp',
    }),
    encoding: 'utf8',
    env: bare,
  });
  let out = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* leave empty: parses as allow, which fails the check as it should */
  }
  check('12 unconfigured guard fails closed', decision(out), 'deny');
}

console.log('\nbinding state:');
for (const f of fs.readdirSync(stateDir)) {
  console.log('  ', f, fs.readFileSync(path.join(stateDir, f), 'utf8'));
}

const d = pre('s1', 'Read', JONES + '\\f.docx', SMITH);
console.log('\ndeny reason:\n ', d.hookSpecificOutput.permissionDecisionReason);

console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail ? 1 : 0);
