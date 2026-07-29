/**
 * Tests for hooks/matter-guard.js.
 *
 *   node tests/matter-guard.test.js hooks/matter-guard.js
 *
 * The hook is driven as a child process with real JSON payloads, deliberately:
 * an earlier shell-based harness reported false passes twice, once because a
 * synchronous stdin read throws on Windows and once because asynchronous
 * stdout writes were lost through command substitution. Both looked like
 * "allowed", which is the dangerous direction for a control of this kind.
 *
 * Regressions for bugs this harness found: case 2, the same matter reached by
 * a second alias was denied; case 11, a path leaving the bound matter via ".."
 * was allowed; case 17, the archive wrote to the identity token rather than a
 * real directory; case 20, the central archive sat outside the boundary so any
 * session could read every matter's records.
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

// Warn mode allows the cross-matter access but must still say something.
{
  const w = { ...env, CLAUDE_MATTER_MODE: 'warn' };
  const call2 = (ev, e) => {
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify(ev), encoding: 'utf8', env: e,
    });
    try { return JSON.parse(r.stdout); } catch { return {}; }
  };
  const bind = { hook_event_name: 'PreToolUse', session_id: 'w1', tool_name: 'Read',
                 tool_input: { file_path: SMITH + '\\a.docx' }, cwd: SMITH };
  call2(bind, w);
  const cross = { ...bind, tool_input: { file_path: JONES + '\\b.docx' } };
  const out = call2(cross, w);
  check('13 warn mode allows', decision(out), 'allow');
  check('14 warn mode still reports', out.systemMessage ? 'yes' : 'no', 'yes');
}

// Off mode does nothing at all.
{
  const o = { ...env, CLAUDE_MATTER_MODE: 'off' };
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'o1',
      tool_name: 'Read', tool_input: { file_path: JONES + '\\b.docx' }, cwd: SMITH }),
    encoding: 'utf8', env: o,
  });
  check('15 off mode is silent', r.stdout.trim() === '' ? 'silent' : 'spoke', 'silent');
}

// Unconfigured + warn must stand down rather than fail closed.
{
  const bare = { ...process.env, CLAUDE_MATTER_MODE: 'warn' };
  delete bare.CLAUDE_MATTER_ROOTS;
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'w2',
      tool_name: 'Read', tool_input: { file_path: 'C:\\x.txt' }, cwd: 'C:\\tmp' }),
    encoding: 'utf8', env: bare,
  });
  let out = {}; try { out = JSON.parse(r.stdout); } catch {}
  check('16 unconfigured + warn does not block', decision(out), 'allow');
}

// SessionEnd must resolve a real directory, not the identity token.
{
  const os = require('os');
  const fakeMatter = path.join(os.tmpdir(), 'guard-archive-test', 'Smith');
  fs.mkdirSync(fakeMatter, { recursive: true });
  const tr = path.join(os.tmpdir(), 'guard-archive-test', 'transcript.jsonl');
  fs.writeFileSync(tr, '{"x":1}\n');
  const localRoot = path.join(os.tmpdir(), 'guard-archive-test');
  const e2 = { ...env, CLAUDE_MATTER_ROOTS: localRoot };
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'a1',
      tool_name: 'Read', tool_input: { file_path: path.join(fakeMatter, 'f.txt') },
      cwd: fakeMatter }), encoding: 'utf8', env: e2 });
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'a1',
      cwd: fakeMatter, transcript_path: tr, reason: 'other' }),
    encoding: 'utf8', env: e2 });
  const archived = fs.existsSync(path.join(fakeMatter, '_ai-record'))
    && fs.readdirSync(path.join(fakeMatter, '_ai-record')).length > 0;
  check('17 transcript filed to matter folder', archived ? 'filed' : 'missing', 'filed');

  const central = path.join(os.tmpdir(), 'guard-archive-test', 'central');
  const e3 = { ...e2, CLAUDE_RECORD_ROOT: central };
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'a1',
      cwd: fakeMatter, transcript_path: tr, reason: 'other' }),
    encoding: 'utf8', env: e3 });
  const centralOk = fs.existsSync(path.join(central, 'smith'))
    && fs.readdirSync(path.join(central, 'smith')).length > 0;
  check('18 transcript filed to central archive', centralOk ? 'filed' : 'missing', 'filed');
}

// The central archive holds every matter's records in one place, so it must
// be inside the boundary too, not treated as ordinary non-client storage.
{
  const ARCHIVE = '\\\\nas.example.invalid\\ai-records';
  const a = { ...env, CLAUDE_RECORD_ROOT: ARCHIVE };
  const callA = (ev) => {
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify(ev), encoding: 'utf8', env: a,
    });
    try { return JSON.parse(r.stdout); } catch { return {}; }
  };
  const bind = { hook_event_name: 'PreToolUse', session_id: 'arch1', tool_name: 'Read',
                 tool_input: { file_path: SMITH + '\\a.docx' }, cwd: SMITH };
  callA(bind);
  check('19 own matter archive readable',
    decision(callA({ ...bind, tool_input: { file_path: ARCHIVE + '\\Smith\\s.jsonl' } })), 'allow');
  check('20 other matter archive blocked',
    decision(callA({ ...bind, tool_input: { file_path: ARCHIVE + '\\Jones\\s.jsonl' } })), 'deny');
}

// Archive nested inside the matters root: the longer root must win, or the
// archive's own folder name is mistaken for a matter.
{
  const NESTED = ROOT + '\\_ai-records';
  const n = { ...env, CLAUDE_RECORD_ROOT: NESTED };
  const callN = (ev) => {
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify(ev), encoding: 'utf8', env: n,
    });
    try { return JSON.parse(r.stdout); } catch { return {}; }
  };
  const bind = { hook_event_name: 'PreToolUse', session_id: 'arch2', tool_name: 'Read',
                 tool_input: { file_path: SMITH + '\\a.docx' }, cwd: SMITH };
  callN(bind);
  check('21 nested archive, own matter',
    decision(callN({ ...bind, tool_input: { file_path: NESTED + '\\Smith\\s.jsonl' } })), 'allow');
  check('22 nested archive, other matter',
    decision(callN({ ...bind, tool_input: { file_path: NESTED + '\\Jones\\s.jsonl' } })), 'deny');
}

console.log('\nbinding state:');
for (const f of fs.readdirSync(stateDir)) {
  console.log('  ', f, fs.readFileSync(path.join(stateDir, f), 'utf8'));
}

const d = pre('s1', 'Read', JONES + '\\f.docx', SMITH);
console.log('\ndeny reason:\n ', d.hookSpecificOutput.permissionDecisionReason);

console.log(`\npassed=${pass} failed=${fail}`);
process.exit(fail ? 1 : 0);
