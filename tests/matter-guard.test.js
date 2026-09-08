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

const { spawnSync, spawn } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Mirrors hooks/matter-guard.js statePath(): sessions are named by a
 * domain-separated SHA-256 hash, not the raw session ID, so a collapsed or
 * lossily-sanitised ID cannot collide with another session's state file. */
function stateFileFor(sessionId) {
  return createHash('sha256').update('matter-guard:' + String(sessionId)).digest('hex') + '.json';
}

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
let skip = 0;
function skipped(label, count = 1) {
  skip += count;
  console.log('SKIP  ' + label);
}
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
    CLAUDE_MATTER_ARCHIVE: '_ai-record',
    ...over,
  };
}

function call(ev, env, rawInput) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: rawInput !== undefined ? rawInput : JSON.stringify(ev),
    encoding: 'utf8',
    env: env || baseEnv(),
    timeout: 10000,
  });
  if (r.error) throw r.error;
  if (r.status === 2) return { hookSpecificOutput: { permissionDecision: 'deny' } };
  if (r.status !== 0) throw new Error(`Hook crashed with exit ${r.status}: ${r.stderr}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}

const decision = (o) =>
  (o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision) || 'allow';

function pre(session, tool, target, cwd, env, rawInput) {
  const key = tool === 'Grep' || tool === 'Glob' ? 'path' : 'file_path';
  return call(
    {
      hook_event_name: 'PreToolUse',
      session_id: session,
      tool_name: tool,
      tool_input: rawInput || { [key]: target },
      cwd,
    },
    env
  );
}

const freshState = () => fs.rmSync(STATE, { recursive: true, force: true });

async function main() {

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
check('08 matters root itself is denied (SEC-03)', decision(pre('s9', 'Glob', MATTERS, TMP)), 'deny');
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
  skipped('10-11 alias cases (link creation unavailable)', 2);
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
  skipped('12 symlink escape (link creation unavailable)');
}

// -- ancestor matrix (SEC-04 / design §6.3) ----------------------------------
// The required property is that a cwd ABOVE ANY protected matter root must be
// refused, independently of how many other roots or a central record root exist.

{
  const PARENT = path.join(TMP, 'parent');
  const ROOT_A = path.join(PARENT, 'root-a');
  const ROOT_B = path.join(PARENT, 'root-b');
  const SMITH_A = path.join(ROOT_A, 'Smith');
  const SMITH_B = path.join(ROOT_B, 'Smith');
  for (const d of [PARENT, ROOT_A, ROOT_B, SMITH_A, SMITH_B]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(SMITH_A, 'a.txt'), 'a');
  fs.writeFileSync(path.join(SMITH_B, 'a.txt'), 'b');

  const twoRootEnv = baseEnv({ CLAUDE_MATTER_ROOTS: [ROOT_A, ROOT_B].join(';') });
  const TWO_CENTRAL = path.join(TMP, 'central-record');
  const centralEnv = baseEnv({ CLAUDE_MATTER_ROOTS: [ROOT_A, ROOT_B].join(';'), CLAUDE_RECORD_ROOT: TWO_CENTRAL });

  // Case 1: cwd equals one matter root -> deny
  freshState();
  check('35 cwd equals one matter root is refused', decision(pre('m1', 'Read', path.join(SMITH_A, 'a.txt'), ROOT_A, twoRootEnv)), 'deny');
  // Case 2: cwd is parent of one of several roots -> deny
  freshState();
  check('36 cwd is parent of one of several roots is refused', decision(pre('m2', 'Read', path.join(SMITH_A, 'a.txt'), PARENT, twoRootEnv)), 'deny');
  // Case 3: cwd is grandparent of one root -> deny
  freshState();
  const GRAND = path.join(TMP, 'grand');
  fs.mkdirSync(GRAND, { recursive: true });
  const grandEnv = baseEnv({ CLAUDE_MATTER_ROOTS: path.join(GRAND, 'child', 'matters') });
  fs.mkdirSync(path.join(GRAND, 'child', 'matters', 'Smith'), { recursive: true });
  fs.writeFileSync(path.join(GRAND, 'child', 'matters', 'Smith', 'a.txt'), 'a');
  check('37 cwd is grandparent of one root is refused', decision(pre('m3', 'Read', path.join(GRAND, 'child', 'matters', 'Smith', 'a.txt'), GRAND, grandEnv)), 'deny');
  // Case 4: cwd is parent of root A but not root B -> deny (current every() fails here)
  freshState();
  check('38 cwd above one of several roots is refused (every() defect)', decision(pre('m4', 'Read', path.join(SMITH_A, 'a.txt'), path.join(ROOT_A, '..'), twoRootEnv)), 'deny');
  // Case 5: cwd is inside one matter -> allow
  freshState();
  check('39 cwd inside one matter is allowed', decision(pre('m5', 'Read', path.join(SMITH_A, 'a.txt'), SMITH_A, twoRootEnv)), 'allow');
  // Case 6: cwd is unrelated -> deny (ancestor of the matters root)
  freshState();
  check('40 cwd unrelated to any root is denied (ancestor)', decision(pre('m6', 'Read', path.join(SMITH_A, 'a.txt'), TMP, twoRootEnv)), 'deny');
  // Case 7: record root configured, cwd is parent of a matter root -> deny (record root must not dilute)
  freshState();
  check('41 record root must not dilute ancestor refusal', decision(pre('m7', 'Read', path.join(SMITH_A, 'a.txt'), PARENT, centralEnv)), 'deny');
}

// -- actual concurrent first-touch integration ------------------------------
// Launch separate hook processes, wait until both are spawned, then release
// their complete stdin events together. No timing seam exists in production.
{
  freshState();
  for (let round = 0; round < 8; round++) {
    const session = 'race-' + round;
    const children = [SMITH, JONES].map((cwd) => {
      const child = spawn(process.execPath, [HOOK], { env: baseEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
      const ready = new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      const result = new Promise((resolve, reject) => {
        let stdout = '', stderr = '';
        const timeout = setTimeout(() => { child.kill(); reject(new Error('concurrent hook timed out')); }, 10000);
        child.stdout.on('data', (data) => { stdout += data; });
        child.stderr.on('data', (data) => { stderr += data; });
        child.once('error', reject);
        child.once('close', (code) => {
          clearTimeout(timeout);
          if (code !== 0 && code !== 2) return reject(new Error(`concurrent hook exited ${code}: ${stderr}`));
          try { resolve(code === 2 ? 'deny' : decision(stdout ? JSON.parse(stdout) : {})); } catch (error) { reject(error); }
        });
      });
      return { child, ready, result, cwd };
    });
    await Promise.all(children.map((c) => c.ready));
    for (const { child, cwd } of children) child.stdin.end(JSON.stringify({
      hook_event_name: 'PreToolUse', session_id: session, cwd, tool_name: 'Read',
      tool_input: { file_path: path.join(cwd, cwd === SMITH ? 'a.txt' : 'b.txt') },
    }));
    const results = await Promise.all(children.map((c) => c.result));
    check(`42 concurrent first touch round ${round + 1}: one winner`, results.filter((d) => d === 'allow').length, 1);
    const saved = JSON.parse(fs.readFileSync(path.join(STATE, stateFileFor(session)), 'utf8'));
    check(`42 concurrent round ${round + 1}: persisted winner`, saved.name.toLowerCase(), results[0] === 'allow' ? 'smith' : 'jones');
  }
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
fs.mkdirSync(STATE, { recursive: true }); // the binding write may not have run
fs.writeFileSync(path.join(STATE, stateFileFor('s7')), '{ this is not json');
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

// -- documented limitations, pinned ---------------------------------------
//
// Test 30 verifies Bash is evaluated by working directory (cwd) only — the
// command string is not parsed. Test 31 verifies unknown tools are denied in
// enforce mode. These are the documented behaviour boundaries. Do not change
// them without updating docs/production-architecture.md.

freshState();
pre('lim1', 'Read', path.join(SMITH, 'a.txt'), SMITH);
check(
  '30 Bash is evaluated by cwd only (not command string)',
  decision(pre('lim1', 'Bash', null, SMITH, undefined, { command: `cat ${path.join(JONES, 'b.txt')}` })),
  'allow'
);
check(
  '31 an unknown tool is denied in enforce mode',
  decision(
    call({
      hook_event_name: 'PreToolUse',
      session_id: 'lim1',
      tool_name: 'SomeFutureTool',
      tool_input: { file_path: path.join(JONES, 'b.txt') },
      cwd: SMITH,
    })
  ),
  'deny'
);

freshState();
pre('ps1', 'Read', path.join(SMITH, 'a.txt'), SMITH); // bind to Smith first
check(
  '32 PowerShell tool is denied unconditionally',
  decision(call({
    hook_event_name: 'PreToolUse',
    session_id: 'ps1',
    tool_name: 'PowerShell',
    tool_input: { command: 'Get-Content ' + path.join(JONES, 'b.txt') },
    cwd: SMITH,
  })),
  'deny'
);

freshState();
check(
  '33 access to matters root itself is denied',
  decision(pre('s10', 'Glob', MATTERS, TMP)),
  'deny'
);

// Test 34 — two genuinely distinct roots that each contain a 'Smith' subfolder.
// The root-qualified identity (SEC-05) must treat them as different matters,
// so binding to Smith under MATTERS2A must refuse access to Smith under MATTERS2B.
{
  const MATTERS2A = path.join(TMP, 'matters2a');
  const MATTERS2B = path.join(TMP, 'matters2b');
  const SMITH2A = path.join(MATTERS2A, 'Smith');
  const SMITH2B = path.join(MATTERS2B, 'Smith');
  for (const d of [SMITH2A, SMITH2B]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(SMITH2A, 'a.txt'), 'a2');
  fs.writeFileSync(path.join(SMITH2B, 'a.txt'), 'b2');

  freshState();
  const twoDistinctEnv = baseEnv({ CLAUDE_MATTER_ROOTS: [MATTERS2A, MATTERS2B].join(';') });
  // Bind session to Smith under MATTERS2A
  pre('s11', 'Read', path.join(SMITH2A, 'a.txt'), SMITH2A, twoDistinctEnv);
  // Access Smith under MATTERS2B — same name, but different root → different identity → denied
  check(
    '34 same matter name under distinct roots is treated as distinct (SEC-05)',
    decision(pre('s11', 'Read', path.join(SMITH2B, 'a.txt'), SMITH2A, twoDistinctEnv)),
    'deny'
  );
}

// -- additional internal-MVP regressions ------------------------------------

freshState();
check('relative same-matter Read anchors to event cwd', decision(pre('relative', 'Read', 'a.txt', SMITH)), 'allow');
check('relative parent traversal refuses sibling', decision(pre('relative', 'Read', '../Jones/b.txt', SMITH)), 'deny');
check('LSP filePath is checked', decision(pre('relative', 'LSP', null, SMITH, undefined, { filePath: path.join(JONES, 'b.txt'), operation: 'hover' })), 'deny');
check('Glob parent pattern refuses sibling', decision(pre('relative', 'Glob', null, SMITH, undefined, { path: SMITH, pattern: '../Jones/**' })), 'deny');
check('Glob absolute pattern refuses sibling', decision(pre('relative', 'Glob', null, SMITH, undefined, { path: SMITH, pattern: JONES + '/**' })), 'deny');
check('Glob brace alternative cannot name absolute sibling', decision(pre('relative', 'Glob', null, SMITH, undefined, { path: SMITH, pattern: '{*.txt,' + JONES + '/**}' })), 'deny');
check('Glob escaped dots cannot name parent', decision(pre('relative', 'Glob', null, SMITH, undefined, { path: SMITH, pattern: '\\.\\./Jones/**' })), 'deny');
check('Glob normal relative pattern allows', decision(pre('relative', 'Glob', null, SMITH, undefined, { pattern: '**/*.txt' })), 'allow');
check('nonexistent same-matter write allows', decision(pre('relative', 'Write', path.join(SMITH, 'new', 'deep', 'file.txt'), SMITH)), 'allow');
for (const target of ['', 123, null, 'a\0b', 'x'.repeat(33000)]) {
  check('malformed or unresolvable tool target refuses', decision(pre('bad-target', 'Read', target, SMITH)), 'deny');
}
check('non-directory ancestor refuses', decision(pre('bad-target', 'Write', path.join(SMITH, 'a.txt', 'child'), SMITH)), 'deny');
check('missing required target refuses', decision(pre('bad-target', 'Read', null, SMITH, undefined, {})), 'deny');
check('missing cwd refuses', decision(pre('bad-target', 'Read', path.join(SMITH, 'a.txt'), undefined)), 'deny');
check('relative cwd refuses', decision(pre('bad-target', 'Read', path.join(SMITH, 'a.txt'), 'Smith')), 'deny');
check('nonexistent cwd refuses', decision(pre('bad-target', 'Read', path.join(SMITH, 'a.txt'), path.join(SMITH, 'absent'))), 'deny');
check('missing session id refuses', decision(pre(undefined, 'Read', path.join(SMITH, 'a.txt'), SMITH)), 'deny');
check('inherited registry name is unknown', decision(pre('proto', 'constructor', null, SMITH)), 'deny');
freshState();
check('mixed first touch refuses before committing binding', decision(pre('mixed-first', 'Read', path.join(JONES, 'b.txt'), SMITH)), 'deny');
check('denied first touch leaves no binding', fs.existsSync(path.join(STATE, stateFileFor('mixed-first'))), false);
check('invalid enforcement mode refuses', decision(pre('mode', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_MATTER_MODE: 'enforc' }))), 'deny');
// Inject only fd-1 failures, through a Node preload, to exercise the actual
// child-process hook contract without a production-only testing branch.
const outputFault = path.join(TMP, 'output-fault.cjs');
fs.writeFileSync(outputFault, "const fs = require('fs'); const write = fs.writeSync; fs.writeSync = (fd, ...args) => { if (fd === 1) throw new Error('synthetic stdout failure'); return write(fd, ...args); };\n");
const faultEvent = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'stdout', tool_name: 'UnknownTool', tool_input: {}, cwd: SMITH });
const outputFailed = spawnSync(process.execPath, ['--require', outputFault, HOOK], { input: faultEvent, env: baseEnv(), encoding: 'utf8', timeout: 10000 });
check('unwritable stdout uses blocking exit code 2', outputFailed.status, 2);
fs.writeFileSync(outputFault, "const fs = require('fs'); const write = fs.writeSync; fs.writeSync = (fd, buffer, offset, length, ...rest) => write(fd, buffer, offset, fd === 1 && Buffer.isBuffer(buffer) ? Math.min(length, 7) : length, ...rest);\n");
const partialOutput = spawnSync(process.execPath, ['--require', outputFault, HOOK], { input: faultEvent, env: baseEnv(), encoding: 'utf8', timeout: 10000 });
check('partial stdout writes still publish complete refusal JSON', partialOutput.status === 0 && decision(JSON.parse(partialOutput.stdout)), 'deny');
check('relative archive root refuses', decision(pre('config', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_RECORD_ROOT: 'archive' }))), 'deny');
check('archive subfolder traversal refuses', decision(pre('config', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ARCHIVE: '../Jones' }))), 'deny');
check('file configured as matter root refuses', decision(pre('config', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ROOTS: path.join(SMITH, 'a.txt') }))), 'deny');
const existingPlaceholder = path.join(TMP, 'REPLACE-WITH-MATTERS');
fs.mkdirSync(existingPlaceholder);
check('existing placeholder root is still rejected', decision(pre('config', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ROOTS: existingPlaceholder }))), 'deny');
check('nested matter roots refuse', decision(pre('config', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_MATTER_ROOTS: MATTERS + ';' + SMITH }))), 'deny');
check('state within matter root refuses', decision(pre('config', 'Read', path.join(SMITH, 'a.txt'), SMITH, baseEnv({ CLAUDE_MATTER_STATE_DIR: path.join(SMITH, 'state') }))), 'deny');
check('tool cannot overwrite binding state', decision(pre('relative', 'Write', path.join(STATE, stateFileFor('relative')), SMITH)), 'deny');

freshState();
pre('observe', 'Read', path.join(SMITH, 'a.txt'), SMITH, WARN);
for (const tool of ['PowerShell', 'NewPluginTool']) {
  const result = pre('observe', tool, null, SMITH, WARN);
  check('warn allows ' + tool, decision(result), 'allow');
  check('warn reports ' + tool, Boolean(result.systemMessage), true);
}
check('warn allows ancestor traversal', decision(pre('observe', 'Glob', MATTERS, SMITH, WARN)), 'allow');
const audit = fs.readFileSync(path.join(STATE, 'would-have-blocked.log'), 'utf8').trim().split('\n').map(JSON.parse);
check('warn audit records all three refusals', audit.length, 3);
check('warn audit uses timestamp and full session hash', audit.every((entry) => Number.isFinite(Date.parse(entry.timestamp)) && /^[a-f0-9]{64}$/.test(entry.session)), true);
for (const event of ['SessionStart', 'SessionEnd']) {
  check('off is silent on ' + event, Object.keys(call({ hook_event_name: event, session_id: 'off', cwd: SMITH, transcript_path: transcript }, baseEnv({ CLAUDE_MATTER_MODE: 'off' }))).length, 0);
}

// Archives must preserve bytes, identity, privacy and existing files.
const end = (session, env, source = transcript) => call({ hook_event_name: 'SessionEnd', session_id: session, cwd: SMITH, transcript_path: source }, env);
const filesUnder = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)]) : [];
const sessionFiles = (session, root = SMITH) => filesUnder(root).filter((file) => file.endsWith(stateFileFor(session).replace(/\.json$/, '.jsonl')));
freshState();
// Whole seconds avoid filesystem timestamp-rounding differences on retries.
const archiveTime = new Date('2026-01-02T03:04:05.000Z');
fs.utimesSync(transcript, archiveTime, archiveTime);
const startResult = call({ hook_event_name: 'SessionStart', session_id: 'prompt-only', cwd: SMITH });
check('SessionStart binds prompt-only sessions', /smith/i.test(startResult.hookSpecificOutput.additionalContext), true);
check('prompt-only archive reports success', end('prompt-only').systemMessage.includes('Session record filed'), true);
check('archive bytes match complete source', fs.readFileSync(sessionFiles('prompt-only')[0], 'utf8'), fs.readFileSync(transcript, 'utf8'));
const firstArchive = sessionFiles('prompt-only')[0];
check('idempotent SessionEnd retry succeeds', end('prompt-only').systemMessage.includes('Session record filed'), true);
check('idempotent retry creates one archive', sessionFiles('prompt-only').length, 1);
const archiveBytes = fs.readFileSync(firstArchive, 'utf8');
const sourceStat = fs.statSync(transcript);
fs.writeFileSync(transcript, '{"x":2}\n');
fs.utimesSync(transcript, sourceStat.atime, sourceStat.mtime);
check('changed transcript with same destination refuses overwrite', end('prompt-only').systemMessage.includes('could NOT'), true);
check('existing archive preserved after collision', fs.readFileSync(firstArchive, 'utf8'), archiveBytes);
check('failed archive cleans staging files', filesUnder(SMITH).some((file) => file.endsWith('.part')), false);
for (const session of ['sameprefix-one', 'sameprefix-two', '../x/y/../hostile']) {
  pre(session, 'Read', path.join(SMITH, 'a.txt'), SMITH);
  check('raw session cannot collide/traverse archive filename', end(session).systemMessage.includes('Session record filed'), true);
  check('archive uses full session hash only', sessionFiles(session).length, 1);
}
check('missing transcript reports a records gap', end('sameprefix-one', undefined, path.join(TMP, 'missing.jsonl')).systemMessage.includes('could NOT'), true);
check('missing transcript path reports a records gap', call({ hook_event_name: 'SessionEnd', session_id: 'sameprefix-one', cwd: SMITH }).systemMessage.includes('could NOT'), true);
check('missing binding reports a records gap', end('never-bound').systemMessage.includes('could NOT'), true);
pre('tampered', 'Read', path.join(SMITH, 'a.txt'), SMITH);
const tampered = JSON.parse(fs.readFileSync(path.join(STATE, stateFileFor('tampered')), 'utf8'));
tampered.dir = JONES;
fs.writeFileSync(path.join(STATE, stateFileFor('tampered')), JSON.stringify(tampered));
check('inconsistent binding refuses tools', decision(pre('tampered', 'Read', path.join(SMITH, 'a.txt'), SMITH)), 'deny');
check('inconsistent binding refuses archival', end('tampered').systemMessage.includes('could NOT'), true);

freshState();
const CENTRAL2 = path.join(TMP, 'new-central');
const secondRoot = path.join(TMP, 'other-root');
const secondSmith = path.join(secondRoot, 'Smith');
fs.mkdirSync(secondSmith, { recursive: true });
fs.writeFileSync(path.join(secondSmith, 'a.txt'), 'second matter');
const env2 = baseEnv({ CLAUDE_RECORD_ROOT: CENTRAL2, CLAUDE_MATTER_ROOTS: MATTERS + ';' + secondRoot });
pre('central-one', 'Read', path.join(SMITH, 'a.txt'), SMITH, env2);
pre('central-two', 'Read', path.join(secondSmith, 'a.txt'), secondSmith, env2);
end('central-one', env2);
end('central-two', env2);
const ownArchive = sessionFiles('central-one', CENTRAL2)[0];
const otherArchive = sessionFiles('central-two', CENTRAL2)[0];
check('distinct roots use distinct central matter buckets', fs.readdirSync(CENTRAL2).length, 2);
check('own central archive is readable', decision(pre('central-one', 'Read', ownArchive, SMITH, env2)), 'allow');
check('same-name other-root archive is denied', decision(pre('central-one', 'Read', otherArchive, SMITH, env2)), 'deny');
check('central archive root is denied', decision(pre('central-one', 'Glob', CENTRAL2, SMITH, env2)), 'deny');
check('central archive ancestor is denied', decision(pre('central-one', 'Grep', TMP, SMITH, env2)), 'deny');
check('central hash bucket without matter is denied', decision(pre('central-one', 'Glob', path.dirname(path.dirname(ownArchive)), SMITH, env2)), 'deny');
const nestedEnv = baseEnv({ CLAUDE_RECORD_ROOT: path.join(MATTERS, 'central-archive') });
check('central archive immediate child of matters supports same matter', decision(pre('nested-central', 'Read', path.join(SMITH, 'a.txt'), SMITH, nestedEnv)), 'allow');
end('nested-central', nestedEnv);
check('nested central archive files normally', sessionFiles('nested-central', path.join(MATTERS, 'central-archive')).length, 1);

if (linkMade) {
  const archivedLink = path.join(SMITH, 'linked-archive');
  fs.symlinkSync(JONES, archivedLink, LINK_TYPE);
  const linkEnv = baseEnv({ CLAUDE_MATTER_ARCHIVE: 'linked-archive' });
  pre('archive-link', 'Read', path.join(SMITH, 'a.txt'), SMITH, linkEnv);
  check('archive symlink escape reports failure', end('archive-link', linkEnv).systemMessage.includes('could NOT'), true);
  check('archive symlink never files into other matter', sessionFiles('archive-link', JONES).length, 0);
  const dangling = path.join(SMITH, 'dangling');
  fs.symlinkSync(path.join(TMP, 'absent-target'), dangling, LINK_TYPE);
  check('dangling link is resolution failure', decision(pre('link', 'Write', path.join(dangling, 'new.txt'), SMITH)), 'deny');
  if (process.platform !== 'win32') {
    // POSIX resolves a symlink before processing a following parent segment.
    const outside = path.join(TMP, 'elsewhere', 'child');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(SMITH, path.join(TMP, 'elsewhere', 'reentry'), 'dir');
    fs.symlinkSync(outside, path.join(JONES, 'out'), 'dir');
    check('symlink then parent follows actual filesystem semantics', decision(pre('symlink-parent', 'Read', JONES + '/out/../reentry/a.txt', JONES)), 'deny');
  } else skipped('POSIX symlink followed by parent resolution (Windows resolves parent segments differently)');
} else {
  skipped('archive symlink escape, dangling link and symlink-parent tests (links unavailable)', 4);
}
if (process.platform !== 'win32') {
  check('archive directory is private', (fs.statSync(path.dirname(firstArchive)).mode & 0o777).toString(8), '700');
  check('archive file is private', (fs.statSync(firstArchive).mode & 0o777).toString(8), '600');
} else skipped('archive POSIX permission bits (Windows uses ACLs)', 2);

// -- state hygiene (H-03) --------------------------------------------------

if (process.platform !== 'win32') {
  freshState();
  pre('p1', 'Read', path.join(SMITH, 'a.txt'), SMITH);
  check('28 state directory is private', (fs.statSync(STATE).mode & 0o777).toString(8), '700');
  check('29 state file is private', (fs.statSync(path.join(STATE, stateFileFor('p1'))).mode & 0o777).toString(8), '600');
} else {
  skipped('28-29 POSIX permission bits (Windows uses ACLs)', 2);
}

console.log(`\npassed=${pass} failed=${fail} skipped=${skip}`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
