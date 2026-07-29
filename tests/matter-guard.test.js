/**
 * Tests for hooks/matter-guard.js.
 *
 *   node tests/matter-guard.test.js
 *
 * The hook is driven as a child process with real JSON payloads, and the suite
 * builds its own temporary matters tree and state directory. It depends on no
 * environment variable, so the documented command runs unchanged on Windows,
 * macOS and Linux.
 *
 * Several cases are regressions for defects found in earlier drafts, marked
 * below. Every one of them failed in the direction that looks like "allowed",
 * which is why this suite asserts refusals rather than absence of output.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = process.argv[2] || path.join(__dirname, '..', 'hooks', 'matter-guard.js');
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
const MATTERS = path.join(TMP, 'matters');
const SMITH = path.join(MATTERS, 'Smith');
const JONES = path.join(MATTERS, 'Jones');
const STATE = path.join(TMP, 'state');
for (const d of [MATTERS, SMITH, JONES]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(SMITH, 'a.txt'), 'a');
fs.writeFileSync(path.join(JONES, 'b.txt'), 'b');

let pass = 0;
let fail = 0;
function check(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} want=${String(want).padEnd(6)} got=${got}`
  );
}

function baseEnv(over) {
  return {
    ...process.env,
    CLAUDE_MATTER_ROOTS: MATTERS,
    CLAUDE_MATTER_MODE: 'enforce',
    CLAUDE_MATTER_STATE_DIR: STATE,
    CLAUDE_RECORD_ROOT: '',
    ...over,
  };
}

function call(ev, env, rawInput) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: rawInput !== undefined ? rawInput : JSON.stringify(ev),
    encoding: 'utf8',
    env: env || baseEnv(),
  });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return {};
  }
}

const decision = (o) =>
  (o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision) || 'allow';

function pre(session, tool, target, cwd, env) {
  const key = tool === 'Grep' || tool === 'Glob' ? 'path' : 'file_path';
  return call(
    {
      hook_event_name: 'PreToolUse',
      session_id: session,
      tool_name: tool,
      tool_input: { [key]: target },
      cwd,
    },
    env
  );
}

const freshState = () => fs.rmSync(STATE, { recursive: true, force: true });

// -- separation ------------------------------------------------------------

freshState();
check('01 first touch binds Smith', decision(pre('s1', 'Read', path.join(SMITH, 'a.txt'), SMITH)), 'allow');
check('02 same matter again', decision(pre('s1', 'Read', path.join(SMITH, 'a.txt'), SMITH)), 'allow');
check('03 second matter is refused', decision(pre('s1', 'Read', path.join(JONES, 'b.txt'), SMITH)), 'deny');
check('04 Write into second matter', decision(pre('s1', 'Write', path.join(JONES, 'n.txt'), SMITH)), 'deny');
check('05 Grep across second matter', decision(pre('s1', 'Grep', JONES, SMITH)), 'deny');
check(
  '06 traversal out of bound matter',
  decision(pre('s1', 'Read', path.join(SMITH, '..', 'Jones', 'b.txt'), SMITH)),
  'deny'
);
check('07 non-client path untouched', decision(pre('s1', 'Read', path.join(TMP, 'x.md'), SMITH)), 'allow');
check('08 matters root is not a matter', decision(pre('s9', 'Glob', MATTERS, TMP)), 'allow');
check('09 separate session binds separately', decision(pre('s2', 'Read', path.join(JONES, 'b.txt'), JONES)), 'allow');

// Regression: identity was the full path, so the same matter reached by a
// second alias for the share compared unequal and was refused.
const ALIAS = path.join(TMP, 'matters-alias');
let aliasMade = true;
try {
  fs.symlinkSync(MATTERS, ALIAS, LINK_TYPE);
} catch {
  aliasMade = false;
}
if (aliasMade) {
  freshState();
  const env = baseEnv({ CLAUDE_MATTER_ROOTS: [MATTERS, ALIAS].join(';') });
  pre('s3', 'Read', path.join(SMITH, 'a.txt'), SMITH, env);
  check('10 same matter via second alias', decision(pre('s3', 'Read', path.join(ALIAS, 'Smith', 'a.txt'), SMITH, env)), 'allow');
  check('11 other matter via second alias', decision(pre('s3', 'Read', path.join(ALIAS, 'Jones', 'b.txt'), SMITH, env)), 'deny');
} else {
  console.log('SKIP  10-11 alias cases (link creation unavailable)');
}

// Regression (H-01): a path lexically inside the bound matter that links out.
const ESCAPE = path.join(SMITH, 'shortcut');
let linkMade = true;
try {
  fs.symlinkSync(JONES, ESCAPE, LINK_TYPE);
} catch {
  linkMade = false;
}
if (linkMade) {
  freshState();
  pre('s4', 'Read', path.join(SMITH, 'a.txt'), SMITH);
  check('12 symlink out of bound matter', decision(pre('s4', 'Read', path.join(ESCAPE, 'b.txt'), SMITH)), 'deny');
} else {
  console.log('SKIP  12 symlink escape (link creation unavailable)');
}

// -- configuration faults: every one fails closed in enforce ---------------

const PLACEHOLDER = 'REPLACE-WITH-YOUR-MATTERS-ROOT-AND-EVERY-ALIAS-SEMICOLON-SEPARATED';
freshState();
check(
  '13 shipped placeholder refuses (H-02)',
  decision(pre('s5', 'Read', path.join(JONES, 'b.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ROOTS: PLACEHOLDER }))),
  'deny'
);
check(
  '14 roots unset refuses',
  decision(pre('s5', 'Read', path.join(JONES, 'b.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ROOTS: '' }))),
  'deny'
);
check(
  '15 relative root refuses',
  decision(pre('s5', 'Read', path.join(JONES, 'b.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ROOTS: 'matters' }))),
  'deny'
);
check(
  '16 unreachable root refuses',
  decision(pre('s5', 'Read', path.join(JONES, 'b.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ROOTS: path.join(TMP, 'nope') }))),
  'deny'
);
check('17 malformed input refuses (C-01)', decision(call(null, baseEnv(), 'not json at all')), 'deny');

const BLOCKED = path.join(TMP, 'blocked-state');
fs.writeFileSync(BLOCKED, 'a file where the directory must go');
check(
  '18 unwritable state refuses (C-01)',
  decision(pre('s6', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_MATTER_STATE_DIR: BLOCKED }))),
  'deny'
);

freshState();
pre('s7', 'Read', path.join(SMITH, 'a.txt'), SMITH);
fs.writeFileSync(path.join(STATE, 's7.json'), '{ this is not json');
check('19 corrupt state refuses (C-01)', decision(pre('s7', 'Read', path.join(SMITH, 'a.txt'), SMITH)), 'deny');

// -- modes -----------------------------------------------------------------

freshState();
const WARN = baseEnv({ CLAUDE_MATTER_MODE: 'warn' });
pre('w1', 'Read', path.join(SMITH, 'a.txt'), SMITH, WARN);
const warned = pre('w1', 'Read', path.join(JONES, 'b.txt'), SMITH, WARN);
check('20 warn allows the crossing', decision(warned), 'allow');
check('21 warn still reports it', warned.systemMessage ? 'yes' : 'no', 'yes');
check(
  '22 warn stands down on bad config',
  decision(pre('w2', 'Read', path.join(JONES, 'b.txt'), SMITH, baseEnv({ CLAUDE_MATTER_MODE: 'warn', CLAUDE_MATTER_ROOTS: PLACEHOLDER }))),
  'allow'
);
const offRun = spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({
    hook_event_name: 'PreToolUse',
    session_id: 'o1',
    tool_name: 'Read',
    tool_input: { file_path: path.join(JONES, 'b.txt') },
    cwd: SMITH,
  }),
  encoding: 'utf8',
  env: baseEnv({ CLAUDE_MATTER_MODE: 'off' }),
});
check('23 off mode is silent', offRun.stdout.trim() === '' ? 'silent' : 'spoke', 'silent');

// -- archiving -------------------------------------------------------------

freshState();
const transcript = path.join(TMP, 'transcript.jsonl');
fs.writeFileSync(transcript, '{"x":1}\n');
pre('a1', 'Read', path.join(SMITH, 'a.txt'), SMITH);
call({ hook_event_name: 'SessionEnd', session_id: 'a1', cwd: SMITH, transcript_path: transcript, reason: 'other' });
const inMatter = path.join(SMITH, '_ai-record');
// Regression (C-02): the POSIX root was stripped, so an absolute matter path
// resolved relative to the process working directory and the record was filed
// into the wrong place entirely.
check(
  '24 record filed inside the matter',
  fs.existsSync(inMatter) && fs.readdirSync(inMatter).length > 0 ? 'filed' : 'missing',
  'filed'
);
check(
  '25 no partial file left behind',
  fs.existsSync(inMatter) && fs.readdirSync(inMatter).some((f) => f.endsWith('.part')) ? 'partial' : 'clean',
  'clean'
);

const CENTRAL = path.join(TMP, 'archive');
freshState();
const envC = baseEnv({ CLAUDE_RECORD_ROOT: CENTRAL });
pre('a2', 'Read', path.join(SMITH, 'a.txt'), SMITH, envC);
call(
  { hook_event_name: 'SessionEnd', session_id: 'a2', cwd: SMITH, transcript_path: transcript, reason: 'other' },
  envC
);
check(
  '26 record filed to central archive',
  fs.existsSync(CENTRAL) && fs.readdirSync(CENTRAL).length > 0 ? 'filed' : 'missing',
  'filed'
);
// The archive holds every matter's records, so it must be inside the boundary.
freshState();
fs.mkdirSync(path.join(CENTRAL, 'Jones'), { recursive: true });
pre('a3', 'Read', path.join(SMITH, 'a.txt'), SMITH, envC);
check(
  '27 other matter archive refused',
  decision(pre('a3', 'Read', path.join(CENTRAL, 'Jones', 's.jsonl'), SMITH, envC)),
  'deny'
);

// -- state hygiene (H-03) --------------------------------------------------

if (process.platform !== 'win32') {
  freshState();
  pre('p1', 'Read', path.join(SMITH, 'a.txt'), SMITH);
  check('28 state directory is private', (fs.statSync(STATE).mode & 0o777).toString(8), '700');
  check('29 state file is private', (fs.statSync(path.join(STATE, 'p1.json')).mode & 0o777).toString(8), '600');
} else {
  console.log('SKIP  28-29 POSIX permission bits (Windows uses ACLs)');
}

console.log(`\npassed=${pass} failed=${fail}`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
