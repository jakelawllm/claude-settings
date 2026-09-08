#!/usr/bin/env node
/**
 * matter-guard — keeps one session to one matter, and files the session record.
 *
 * Three hook events, dispatched on hook_event_name:
 *
 *   PreToolUse    binds the session to the first matter it touches and denies
 *                 any later path under a different matter
 *   SessionEnd    copies the completed transcript into the matter folder
 *   SessionStart  binds an existing cwd matter and names it in a reminder
 *                 (advisory only: SessionStart cannot block)
 *
 * Configuration, via the managed settings env block:
 *
 *   CLAUDE_MATTER_ROOTS   required in enforce mode. Semicolon-separated list of
 *                         every path denoting the matters root: the IP form,
 *                         the hostname form, and any drive letter staff map to
 *                         it. An unlisted alias is not recognised as client
 *                         material.
 *   CLAUDE_MATTER_MODE    enforce (block) | warn (observe) | off. Default
 *                         enforce.
 *   CLAUDE_RECORD_ROOT    optional. File records to
 *                         <root>/<SHA-256 matter identity>/<matter>.
 *   CLAUDE_MATTER_ARCHIVE optional. Subfolder name. Default "_ai-record".
 *   CLAUDE_MATTER_STATE_DIR optional. Where session bindings are kept.
 *
 * FAILURE POSTURE. In enforce mode every failure this file can detect is a
 * refusal: unreadable input, unusable configuration, unreadable or corrupt
 * state, a state directory that cannot be created privately, and any unexpected
 * exception. The reason is that each of those leaves the guard unable to tell
 * one matter from another, and a control that cannot tell must not permit. In
 * warn mode nothing is ever refused, by definition.
 *
 * WHAT THIS DOES NOT REACH. Bash is bound by working directory only; the
 * command string is not parsed, so a shell command can still address another
 * matter directly. The PreToolUse matcher is the wildcard "*", and a tool
 * absent from the capability registry below is refused in enforce mode rather
 * than passed through: the failure direction is a refusal, not a gap. The cost
 * is that the registry must be extended when a new built-in, plugin or MCP
 * tool is introduced, or that tool stops working until it is classified.
 * Hooks are client-side and constrain the model, not a determined user.
 *
 * The operating system sandbox is what contains a Bash command, and enabling
 * it is necessary but not sufficient: Claude's sandbox permits reads across
 * the whole machine unless a per-matter filesystem policy is also configured.
 * scripts/generate-matter-sandbox.py generates that policy; until deployed,
 * no part of this file or the shipped template supplies per-matter
 * Bash isolation. Native Windows has no sandbox equivalent, and there the
 * guard is advisory for those routes.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash, randomUUID } = require('crypto');

const WIN = process.platform === 'win32';
const ARCHIVE_DIR = process.env.CLAUDE_MATTER_ARCHIVE || '_ai-record';
const RECORD_ROOT = process.env.CLAUDE_RECORD_ROOT || '';
const MODE = (process.env.CLAUDE_MATTER_MODE || 'enforce').trim().toLowerCase();
let currentEvent;

const STATE_DIR =
  process.env.CLAUDE_MATTER_STATE_DIR ||
  path.join(process.env.LOCALAPPDATA || os.homedir() || os.tmpdir(), 'claude-matter-guard');
const AUDIT_LOG = path.join(STATE_DIR, 'would-have-blocked.log');

/** Emit on fd 1 synchronously: an async write lost at exit is a silent allow.
 *  If stdout is unavailable we exit 2 so the PreToolUse contract still blocks. */
function emit(obj) {
  try {
    const output = Buffer.from(JSON.stringify(obj));
    let offset = 0;
    while (offset < output.length) {
      const written = fs.writeSync(1, output, offset, output.length - offset);
      if (!written) throw new Error('stdout did not accept the hook decision');
      offset += written;
    }
  } catch {
    /* stdout failed — fall back to blocking exit code per the documented hook contract */
    try { process.exit(2); } catch { /* best effort */ }
  }
}

function deny(reason) {
  if (MODE === 'warn') {
    let auditFailed = false;
    try {
      ensureStateDir();
      try {
        if (!fs.lstatSync(AUDIT_LOG).isFile()) throw new Error('audit log is not a regular file');
      } catch (err) { if (err.code !== 'ENOENT') throw err; }
      fs.appendFileSync(AUDIT_LOG, JSON.stringify({
        timestamp: new Date().toISOString(),
        session: sessionHash(currentEvent && currentEvent.session_id),
        tool: currentEvent && currentEvent.tool_name,
        reason,
      }) + '\n', { encoding: 'utf8', mode: 0o600 });
      if (!WIN) fs.chmodSync(AUDIT_LOG, 0o600);
    } catch {
      auditFailed = true;
    }
    emit({ systemMessage: `Matter separation warning: ${reason} Allowed because the guard is in warn mode.` +
      (auditFailed ? ' The observation log could NOT be written; repair it before evaluating enforcement readiness.' : '') });
    return true;
  }
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
  return true;
}

/** A refusal caused by the guard's own state rather than by the user's request. */
function denyFault(what) {
  return deny(
    `The matter separation guard cannot verify that this action stays within ` +
      `one matter (${what}). This is a fault in the ` +
      `guard or its deployment, not a judgement about the task. Report it to ` +
      `the AI Officer before continuing client work.`
  );
}

// --------------------------------------------------------------------------
// Paths
// --------------------------------------------------------------------------

/** Windows compares paths case-insensitively; POSIX does not. */
function fold(s) {
  return WIN ? s.toLowerCase() : s;
}

function isAbsolutePath(p) {
  return typeof p === 'string' && path.isAbsolute(p) && (!WIN || !/^[\\/][^\\/]/.test(p));
}

/**
 * Compare paths already resolved by realCanonical. Preserve POSIX backslashes
 * (valid filename characters), normalise Windows separators and device prefixes,
 * and retain the filesystem root.
 */
function canonical(p) {
  let s = WIN ? p.replace(/\\/g, '/') : p;
  s = s.replace(/^\/\/\?\/unc\//i, '//').replace(/^\/\/\?\//, '');
  return fold(s.replace(/(.)\/+$/, '$1'));
}

/**
 * Canonical form of the path the filesystem actually reaches. A path lexically
 * inside one matter can be a symlink or junction into another, so comparison on
 * the literal string is not a boundary. Resolve every component before applying
 * a following parent segment. Missing components can be appended for writes;
 * inaccessible paths, non-directory ancestors and dangling links must refuse.
 */
function realCanonical(p) {
  if (!isAbsolutePath(p) || p.length > 32768 || p.includes('\0')) {
    throw new Error('path must be a usable absolute path');
  }
  if (WIN && /^\\\\\.\\/.test(p)) throw new Error('device paths are not supported');
  const root = path.parse(p).root;
  let current = fs.realpathSync(root);
  // Resolve one component at a time. Normalising ".." before following a
  // symlink can change the directory actually reached on POSIX.
  for (const segment of p.slice(root.length).split(WIN ? /[\\/]/ : /\//)) {
    if (!segment || segment === '.') continue;
    try {
      if (!fs.statSync(current).isDirectory()) throw new Error('path ancestor is not a directory');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (segment === '..') {
      current = path.dirname(current);
      continue;
    }
    const next = path.join(current, segment);
    try {
      current = fs.realpathSync(next);
    } catch (err) {
      // Only a genuinely missing component can be appended for a future write.
      // EACCES, ENOTDIR, ELOOP and dangling links are resolution failures.
      if (err.code !== 'ENOENT') throw new Error('path resolution failed: ' + err.code);
      let entry;
      try { entry = fs.lstatSync(next); } catch (statError) {
        if (statError.code !== 'ENOENT') throw new Error('path inspection failed: ' + statError.code);
      }
      if (entry) throw new Error('path contains an unresolved symbolic link');
      current = next;
    }
  }
  const resolved = canonical(current);
  if (p.slice(root.length).split(WIN ? /[\\/]/ : /\//).includes('..') &&
      realCanonical(path.resolve(p)) !== resolved) {
    // Some clients normalise before opening; POSIX may follow the link first.
    // Refuse an ambiguous spelling instead of guessing which target is used.
    throw new Error('parent traversal through a symbolic link is ambiguous; use the direct path');
  }
  return resolved;
}

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

const PLACEHOLDER = /replace-with|your-matters-root|example\.invalid$/i;

/**
 * The configured roots, and why they are unusable if they are.
 *
 * A placeholder left in the file is the dangerous case: it is a non-empty
 * string, so a check for "no roots configured" passes, enforcement appears
 * active, nothing ever matches it and every matter is permitted. It is
 * rejected explicitly. So is a relative path, which cannot denote a share.
 *
 * Aliases that do not resolve on this machine are dropped rather than fatal,
 * because a mapped drive letter is legitimately absent on most machines. If
 * none of them resolve there is no boundary to enforce, and that is fatal.
 */
function resolveRoots() {
  try { return validatedRoots(); } catch (err) {
    return { matterRoots: [], recordRoots: [], error: err.message };
  }
}

function validatedRoots() {
  const raw = (process.env.CLAUDE_MATTER_ROOTS || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (raw.length === 0) return { matterRoots: [], recordRoots: [], error: 'CLAUDE_MATTER_ROOTS is not set' };

  const placeholders = raw.filter((r) => PLACEHOLDER.test(r));
  if (placeholders.length) {
    return { matterRoots: [], recordRoots: [], error: 'CLAUDE_MATTER_ROOTS still contains the shipped placeholder' };
  }
  const relative = raw.filter((r) => !isAbsolutePath(r));
  if (relative.length) {
    return { matterRoots: [], recordRoots: [], error: `CLAUDE_MATTER_ROOTS contains a relative path: ${relative[0]}` };
  }

  const present = raw.filter((r) => {
    try {
      if (!fs.statSync(r).isDirectory()) throw new Error('a configured matter root is not a directory');
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  });
  const usable = present.map(realCanonical).filter(Boolean);
  if (usable.length === 0) {
    return { matterRoots: [], recordRoots: [], error: 'no configured matters root is reachable from this machine' };
  }
  const seenRoots = new Set();
  const deduped = usable.filter((r) => {
    if (seenRoots.has(r)) return false;
    seenRoots.add(r);
    return true;
  });

  if (!['enforce', 'warn', 'off'].includes(MODE)) {
    throw new Error('CLAUDE_MATTER_MODE must be enforce, warn, or off');
  }
  if (!ARCHIVE_DIR || ARCHIVE_DIR === '.' || ARCHIVE_DIR === '..' ||
      /[\\/:\0]/.test(ARCHIVE_DIR) || /[. ]$/.test(ARCHIVE_DIR)) {
    throw new Error('CLAUDE_MATTER_ARCHIVE must be one safe subfolder name');
  }
  if (!isAbsolutePath(STATE_DIR)) throw new Error('CLAUDE_MATTER_STATE_DIR must be absolute');
  const stateCanon = realCanonical(STATE_DIR);
  let recordRootCanon = null;
  if (RECORD_ROOT) {
    if (PLACEHOLDER.test(RECORD_ROOT)) throw new Error('CLAUDE_RECORD_ROOT contains a placeholder');
    recordRootCanon = realCanonical(RECORD_ROOT);
    if (fs.existsSync(RECORD_ROOT) && !fs.statSync(RECORD_ROOT).isDirectory()) {
      throw new Error('CLAUDE_RECORD_ROOT must be a directory');
    }
  }
  const matterRoots = deduped;
  for (const root of matterRoots) {
    if (matterRoots.some((other) => other !== root && isWithin(root, other))) {
      throw new Error('configured matter roots must not overlap');
    }
    if (isWithin(stateCanon, root) || isWithin(root, stateCanon)) {
      throw new Error('state directory and matter roots must not overlap');
    }
    if (recordRootCanon && (isWithin(root, recordRootCanon) ||
        (isWithin(recordRootCanon, root) && path.posix.dirname(recordRootCanon) !== root))) {
      throw new Error('record root must be outside matters or an immediate child of a matter root');
    }
  }
  if (recordRootCanon && (isWithin(stateCanon, recordRootCanon) || isWithin(recordRootCanon, stateCanon))) {
    throw new Error('state directory and record root must not overlap');
  }
  const recordRoots = recordRootCanon ? [recordRootCanon] : [];
  return { matterRoots: matterRoots.sort((a, b) => b.length - a.length), recordRoots, stateCanon, error: null };
}

function isWithin(child, parent) {
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : parent + '/');
}

/**
 * The matter a path belongs to, or null if it is not client material, or the
 * { type: 'root' } sentinel if it names a configured matters root itself: a
 * root is not a matter and must not be waved through as one (SEC-03).
 */
function matterOf(candidate, matterRoots, recordRoots) {
  const c = realCanonical(candidate);

  if ([...matterRoots, ...recordRoots].some((root) => isWithin(root, c))) return { type: 'root' };

  // First check record roots
  for (const root of recordRoots) {
    if (!isWithin(c, root)) continue;
    const [hash, name] = c.slice(root.length + 1).split('/');
    if (!/^[a-f0-9]{64}$/.test(hash) || !name) return { type: 'root' };
    for (const matterRoot of matterRoots) {
      const dir = matterRoot + '/' + name;
      const id = 'matter:' + dir;
      if (matterHash(id) === hash && realCanonical(dir) === dir && fs.statSync(dir).isDirectory()) {
        return { name, id, dir };
      }
    }
    return { type: 'root' }; // legacy, unknown or ambiguous archive identity
  }

  // Then check matter roots
  for (const root of matterRoots) {
    if (!isWithin(c, root)) continue;
    if (c === root) return { type: 'root' };
    const name = c.slice(root.length + 1).split('/')[0];
    return { name, id: 'matter:' + root + '/' + name, dir: root + '/' + name };
  }

  return null;
}

/**
 * Explicit capability registry (SEC-06): every tool this guard reasons about,
 * and how. A tool absent from this list is 'unknown' rather than silently
 * contributing no targets, so a new built-in, plugin or MCP tool cannot reach
 * client material through a gap in a switch statement.
 */
const TOOL_CAPS = {
  // Filesystem tools
  Read: { targets: ['file_path'] },
  Edit: { targets: ['file_path'] },
  Write: { targets: ['file_path'] },
  MultiEdit: { targets: ['file_path'] },
  NotebookEdit: { targets: ['notebook_path', 'file_path'] },
  Grep: { targets: ['path'] },
  Glob: { targets: ['path'] },
  // Process tools
  Bash: { type: 'bash' }, // working-directory only; see the note at the head of the file
  PowerShell: { type: 'deny' }, // refused in enforce; observed in warn
  // Network/transmission tools
  WebFetch: { type: 'network' },
  WebSearch: { type: 'network' },
  // Orchestration tools have no direct filesystem target. Their child tool
  // calls still require managed hooks and OS isolation.
  Skill: { type: 'non-resource' },
  AskUserQuestion: { type: 'non-resource' },
  Agent: { type: 'non-resource' },
  TaskCreate: { type: 'non-resource' },
  TaskUpdate: { type: 'non-resource' },
  Monitor: { type: 'bash' },
  LSP: { targets: ['filePath'] },
  TaskGet: { type: 'non-resource' },
  TaskList: { type: 'non-resource' },
  TaskStop: { type: 'non-resource' },
  TaskOutput: { type: 'non-resource' },
  TodoWrite: { type: 'non-resource' },
  EnterPlanMode: { type: 'non-resource' },
  ExitPlanMode: { type: 'non-resource' },
  // Lifecycle
  SessionStart: { type: 'non-resource' },
  SessionEnd: { type: 'non-resource' },
  Notification: { type: 'non-resource' },
};

/** The registry entry for a tool, or the 'unknown' sentinel if it is not listed. */
function capsOf(toolName) {
  return Object.hasOwn(TOOL_CAPS, toolName) ? TOOL_CAPS[toolName] : { type: 'unknown' };
}

/** Every path a tool call would touch. An unknown tool contributes nothing. */
function targetsOf(toolName, input) {
  const caps = capsOf(toolName);
  if (!caps.targets) return [];
  const targets = caps.targets.filter((k) => Object.hasOwn(input, k)).map((k) => input[k]);
  if (targets.some((v) => typeof v !== 'string' || !v || v.includes('\0'))) {
    throw new Error('tool path is missing or malformed');
  }
  if (!targets.length && !['Grep', 'Glob'].includes(toolName)) throw new Error('required tool path is missing');
  return targets;
}

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

/**
 * The session id is attacker-influenceable input, not a filename (SEC-09): a
 * stripping sanitiser can still collide two different ids down to the same
 * name, or be used to probe the state directory. Hashing removes both.
 */
function statePath(sessionId) {
  return path.join(STATE_DIR, sessionHash(sessionId) + '.json');
}

const sessionHash = (id) => createHash('sha256').update('matter-guard:' + String(id)).digest('hex');
const matterHash = (id) => createHash('sha256').update(id).digest('hex');

/** Private by construction: the state names matters and sessions. */
function ensureStateDir() {
  if (!isAbsolutePath(STATE_DIR)) throw new Error('state directory must be absolute');
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(STATE_DIR).isDirectory()) throw new Error('state directory must not be a link');
  if (!WIN) {
    // mkdir honours the umask, so the mode above is a request, not a result.
    fs.chmodSync(STATE_DIR, 0o700);
  }
}

/** Returns the binding, null if absent, or throws if present and untrustworthy. */
function readBinding(sessionId) {
  let raw;
  try {
    ensureStateDir();
    if (!fs.lstatSync(statePath(sessionId)).isFile()) throw new Error('binding must be a regular file');
    if (!WIN) fs.chmodSync(statePath(sessionId), 0o600);
    raw = fs.readFileSync(statePath(sessionId), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err; // unreadable is not the same as absent
  }
  const b = JSON.parse(raw);
  if (!b || typeof b.id !== 'string' || typeof b.name !== 'string' || typeof b.dir !== 'string') {
    throw new Error('binding is malformed');
  }
  return b;
}

function validateBinding(binding, config) {
  if (!binding) return;
  const resolved = matterOf(binding.dir, config.matterRoots, config.recordRoots);
  if (!resolved || resolved.type || resolved.id !== binding.id || resolved.name !== binding.name ||
      resolved.dir !== binding.dir || !fs.statSync(binding.dir).isDirectory()) {
    throw new Error('binding does not identify an existing configured matter');
  }
}

/**
 * Written atomically using exclusive create on the target path. This is the
 * SEC-03 fix: the prior read–decide–rename sequence was racy because two hook
 * processes could both observe no binding, both decide on a matter, and both
 * overwrite each other via renameSync. openSync with 'wx' refuses to clobber
 * an existing binding file; on EEXIST we reread and return the winner so the
 * caller can compare and deny a mismatch.
 */
function writeBinding(sessionId, binding) {
  ensureStateDir();
  const target = statePath(sessionId);
  let fd;
  try {
    fd = fs.openSync(target, 'wx', 0o600);
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      // Another process won the race. Reread so the caller can compare.
      return readBinding(sessionId);
    }
    throw err;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify(binding), 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return binding;
}

// --------------------------------------------------------------------------
// Events
// --------------------------------------------------------------------------

function preToolUse(ev) {
  if (!['enforce', 'warn'].includes(MODE)) return denyFault('CLAUDE_MATTER_MODE must be enforce, warn, or off');
  const caps = capsOf(ev.tool_name);
  if (caps.type === 'deny') return deny('PowerShell tools are not permitted under the matter-separation policy.');
  if (caps.type === 'unknown') return denyFault('unknown tool: ' + ev.tool_name + ' — not in the approved tool registry');

  const config = resolveRoots();
  if (config.error) return denyFault(config.error);
  const { matterRoots, recordRoots, stateCanon } = config;
  if (ev.tool_name === 'Glob' && ev.tool_input.pattern !== undefined &&
      (typeof ev.tool_input.pattern !== 'string' ||
       /(^|[,{])(?:[\\/~]|[a-z]:)|\.\.|\\\.|\[[^\]]*\.[^\]]*\]/i.test(ev.tool_input.pattern))) {
    return denyFault('Glob patterns must be relative and contain no parent traversal; use the path field for a directory');
  }
  // The event cwd, not the hook process cwd, anchors relative tool paths.
  if (!isAbsolutePath(ev.cwd) || !fs.statSync(ev.cwd).isDirectory()) return denyFault('cwd must be an existing absolute directory');
  const targets = targetsOf(ev.tool_name, ev.tool_input).map((target) => {
    if (isAbsolutePath(target)) return target;
    if (/^[a-z]:/i.test(target) || (WIN && /^[\\/]/.test(target))) throw new Error('drive-relative paths are not supported');
    return ev.cwd + path.sep + target;
  });
  if (targets.some((target) => {
    const c = realCanonical(target);
    return isWithin(c, stateCanon) || isWithin(stateCanon, c);
  })) return denyFault('tool access to the private matter-guard state or its ancestors is not permitted');

  const touched = [...targets, ev.cwd].map((candidate) => matterOf(candidate, matterRoots, recordRoots)).filter(Boolean);
  if (touched.some((m) => m.type === 'root')) {
    return denyFault('path reaches a matter/archive root, its ancestor, or an unrecognised archive identity — use one matter folder');
  }
  // Validate persisted state even for non-client calls: corruption cannot be
  // used to make the control appear healthy until the next matter read.
  let binding = readBinding(ev.session_id);
  validateBinding(binding, config);
  const distinct = [...new Map(touched.map((m) => [m.id, m])).values()];
  if (distinct.length > 1) return deny('This call touches more than one matter. Start a session in a single matter folder.');
  if (!distinct.length) return;
  const candidate = distinct[0];
  if (!binding) {
    validateBinding(candidate, config);
    binding = writeBinding(ev.session_id, candidate);
    if (!binding) throw new Error('binding disappeared during first-touch registration');
    validateBinding(binding, config);
  }
  if (binding.id !== candidate.id) {
    return deny(`This session is confined to matter "${binding.name}" and the requested path belongs to "${candidate.name}". Start a new session in the other matter's folder.`);
  }
}

function sessionStart(ev) {
  const config = resolveRoots();
  let context;
  try {
    if (config.error) throw new Error(config.error);
    let binding = readBinding(ev.session_id);
    validateBinding(binding, config);
    const m = matterOf(ev.cwd, config.matterRoots, config.recordRoots);
    if (!binding && m && !m.type) {
      // Prompt-only sessions also need an unambiguous archive destination.
      validateBinding(m, config);
      binding = writeBinding(ev.session_id, m);
      validateBinding(binding, config);
    }
    context = binding
      ? `This session is bound to matter "${binding.name}". ` +
        (MODE === 'warn' ? 'The guard is observing only; cross-matter calls are allowed and reported.' :
          'Cross-matter file calls are blocked. Bash still requires OS isolation.')
      : 'This session did not start in one matter folder. Start inside a single matter before client work.';
  } catch (err) {
    context = `The matter separation guard is not usable (${err.message}). Client work should not proceed until it is fixed.`;
  }
  emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } });
}

/** Convenience archive only: the external records schema is not emitted here. */
function sessionEnd(ev) {
  let tmp;
  try {
    const config = resolveRoots();
    if (config.error) throw new Error(config.error);
    const binding = readBinding(ev.session_id);
    if (!binding) throw new Error('the session binding is missing');
    validateBinding(binding, config);
    if (!isAbsolutePath(ev.transcript_path)) throw new Error('transcript_path must be absolute');
    const transcriptStat = fs.statSync(ev.transcript_path);
    if (!transcriptStat.isFile() || !transcriptStat.size) throw new Error('transcript is missing, empty, or not a regular file');
    const expectedDest = RECORD_ROOT
      ? config.recordRoots[0] + '/' + matterHash(binding.id) + '/' + binding.name
      : binding.dir + '/' + ARCHIVE_DIR;
    // Reject an archive folder replaced by a symlink/junction to another path.
    if (realCanonical(expectedDest) !== canonical(expectedDest)) throw new Error('archive destination resolves outside its expected directory');
    fs.mkdirSync(expectedDest, { recursive: true, mode: 0o700 });
    if (!WIN) {
      fs.chmodSync(expectedDest, 0o700);
      if (RECORD_ROOT) {
        fs.chmodSync(config.recordRoots[0], 0o700);
        fs.chmodSync(path.dirname(expectedDest), 0o700);
      }
    }
    const stamp = transcriptStat.mtime.toISOString().replace(/[:.]/g, '-');
    const final = path.join(expectedDest, `session-${stamp}-${sessionHash(ev.session_id)}.jsonl`);
    tmp = `${final}.${randomUUID()}.part`;
    // Write privately and durably, then publish via an exclusive hard link.
    // A retry never overwrites an earlier archive, and a torn copy stays .part.
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try {
      const source = fs.openSync(ev.transcript_path, 'r');
      try {
        const buffer = Buffer.alloc(64 * 1024);
        let count;
        while ((count = fs.readSync(source, buffer, 0, buffer.length, null)) > 0) {
          let written = 0;
          while (written < count) written += fs.writeSync(fd, buffer, written, count - written);
        }
      } finally { fs.closeSync(source); }
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    try { fs.linkSync(tmp, final); } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (!fs.lstatSync(final).isFile() || hashFile(final) !== hashFile(tmp)) {
        throw new Error('archive already exists with different content; original preserved');
      }
    }
    emit({ systemMessage: 'Session record filed to the configured matter archive.' });
  } catch (err) {
    emit({ systemMessage: `Session record could NOT be filed (${err.message}). Record the session on the matter file by hand and investigate the archive failure.` });
  } finally {
    if (tmp) {
      try { fs.unlinkSync(tmp); } catch { /* Only this invocation's private staging file. */ }
    }
  }
}

function hashFile(filename) {
  const hash = createHash('sha256');
  const fd = fs.openSync(filename, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

// --------------------------------------------------------------------------

function dispatch(raw) {
  if (MODE === 'off') return;
  let ev;
  try {
    ev = JSON.parse(raw);
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw new Error('not an object');
  } catch {
    // Unreadable input means the guard cannot know what is being attempted.
    denyFault('the hook received input it could not read');
    return;
  }
  currentEvent = ev;
  if (typeof ev.session_id !== 'string' || !ev.session_id.trim() || ev.session_id.length > 4096) {
    if (ev.hook_event_name === 'SessionEnd') return emit({ systemMessage: 'Session record could NOT be filed: invalid session ID.' });
    return denyFault('the hook requires a nonempty session ID');
  }
  switch (ev.hook_event_name) {
    case 'PreToolUse':
      if (typeof ev.tool_name !== 'string' || !ev.tool_name || !ev.tool_input ||
          typeof ev.tool_input !== 'object' || Array.isArray(ev.tool_input)) {
        return denyFault('tool name and tool input are required');
      }
      return preToolUse(ev);
    case 'SessionStart':
      return sessionStart(ev);
    case 'SessionEnd':
      return sessionEnd(ev);
    default:
      return denyFault('unknown or missing hook event');
  }
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => {
    raw += c;
  });
  process.stdin.on('end', () => {
    try {
      dispatch(raw);
    } catch (err) {
      // An unexpected exception would otherwise exit non-zero, which Claude
      // Code treats as non-blocking: the guard would fail open on a bug.
      if (MODE !== 'off') denyFault(`unexpected error: ${err && err.message}`);
    }
  });
  process.stdin.on('error', () => {
    if (MODE !== 'off') denyFault('the hook could not read its input');
  });
}

main();
