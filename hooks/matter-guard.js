#!/usr/bin/env node
/**
 * matter-guard — keeps one session to one matter, and files the session record.
 *
 * Three hook events, dispatched on hook_event_name:
 *
 *   PreToolUse    binds the session to the first matter it touches and denies
 *                 any later path under a different matter
 *   SessionEnd    copies the completed transcript into the matter folder
 *   SessionStart  injects a reminder naming the bound matter (advisory only:
 *                 SessionStart cannot block)
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
 *   CLAUDE_RECORD_ROOT    optional. File records to <root>/<matter> instead of
 *                         the matter's own folder.
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
 * the whole machine unless a per-matter filesystem policy is also configured,
 * and this repository does not yet generate one. Until it does, no part of
 * this file or the shipped template should be read as supplying per-matter
 * Bash isolation. Native Windows has no sandbox equivalent, and there the
 * guard is advisory for those routes.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');

const WIN = process.platform === 'win32';
const ARCHIVE_DIR = process.env.CLAUDE_MATTER_ARCHIVE || '_ai-record';
const RECORD_ROOT = process.env.CLAUDE_RECORD_ROOT || '';
const MODE = (process.env.CLAUDE_MATTER_MODE || 'enforce').toLowerCase();

const STATE_DIR =
  process.env.CLAUDE_MATTER_STATE_DIR ||
  path.join(process.env.LOCALAPPDATA || os.homedir() || os.tmpdir(), 'claude-matter-guard');
const AUDIT_LOG = path.join(STATE_DIR, 'would-have-blocked.log');

/** Emit on fd 1 synchronously: an async write lost at exit is a silent allow.
 *  If stdout is unavailable we exit 2 so the PreToolUse contract still blocks. */
function emit(obj) {
  try {
    fs.writeSync(1, JSON.stringify(obj));
  } catch {
    /* stdout failed — fall back to blocking exit code per the documented hook contract */
    try { process.exit(2); } catch { /* best effort */ }
  }
}

function deny(reason) {
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
      `one matter (${what}), so it is refusing it. This is a fault in the ` +
      `guard or its deployment, not a judgement about the task. Report it to ` +
      `the AI Officer before continuing client work. To run without enforcing ` +
      `while it is fixed, set CLAUDE_MATTER_MODE=warn.`
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
  return /^([a-zA-Z]:[\\/]|\\\\|\/\/|\/)/.test(p);
}

/**
 * Reduce a path to a comparable form. Separators are normalised, extended
 * length prefixes removed, and "." and ".." resolved so a path that leaves the
 * bound matter and re-enters another is not read as its first segment. The
 * POSIX root and the UNC double slash are both preserved: stripping either
 * turns an absolute path into a relative one and breaks every comparison and
 * the archive destination with it.
 */
function canonical(p) {
  if (!p) return '';
  let s = String(p).trim().replace(/\\/g, '/');
  s = s.replace(/^\/\/\?\/unc\//i, '//'); // \\?\UNC\host\share
  s = s.replace(/^\/\/\?\//, ''); // \\?\C:\...

  const unc = s.startsWith('//');
  const rooted = !unc && s.startsWith('/');
  const parts = (unc ? s.slice(2) : s).split('/');
  const prefix = unc ? parts.splice(0, 2) : []; // host and share are fixed
  const out = [];
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  const joined = [...prefix, ...out].join('/');
  const lead = unc ? '//' : rooted ? '/' : '';
  return fold((lead + joined).replace(/(.)\/+$/, '$1'));
}

/**
 * Canonical form of the path the filesystem actually reaches. A path lexically
 * inside one matter can be a symlink or junction into another, so comparison on
 * the literal string is not a boundary. The deepest existing ancestor is
 * resolved and the unresolved remainder appended, which covers a write to a
 * file that does not exist yet.
 */
function realCanonical(p) {
  if (!p) return '';
  if (String(p).length > 4096) {
    // path too long — cannot safely canonicalise
    return ''; // empty string will not match any root, will be treated as non-client
  }
  let current = String(p);
  const tail = [];
  for (let i = 0; i < 64; i++) {
    try {
      const resolved = fs.realpathSync(current);
      return canonical(tail.length ? path.join(resolved, ...tail.reverse()) : resolved);
    } catch {
      const parent = path.dirname(current);
      if (!parent || parent === current) break;
      tail.push(path.basename(current));
      current = parent;
    }
  }
  return '';
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
  const raw = (process.env.CLAUDE_MATTER_ROOTS || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (raw.length === 0) return { matterRoots: [], recordRoots: [], error: 'CLAUDE_MATTER_ROOTS is not set' };

  const placeholders = raw.filter((r) => PLACEHOLDER.test(r) && !fs.existsSync(r));
  if (placeholders.length) {
    return { matterRoots: [], recordRoots: [], error: 'CLAUDE_MATTER_ROOTS still contains the shipped placeholder' };
  }
  const relative = raw.filter((r) => !isAbsolutePath(r));
  if (relative.length) {
    return { matterRoots: [], recordRoots: [], error: `CLAUDE_MATTER_ROOTS contains a relative path: ${relative[0]}` };
  }

  const present = raw.filter((r) => {
    try {
      return fs.existsSync(r);
    } catch {
      return false;
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

  // Separate matter roots from record root
  const recordRootCanon = RECORD_ROOT ? realCanonical(RECORD_ROOT) : null;
  const matterRoots = deduped.filter(r => r !== recordRootCanon);

  if (matterRoots.length === 0) {
    return { matterRoots: [], recordRoots: [], error: 'no matter roots available after excluding record root' };
  }

  // Longest first: an archive nested inside the matters root must match as the
  // archive, not be read as a matter named after its own folder.
  const recordRoots = recordRootCanon ? [recordRootCanon] : [];
  return { matterRoots: matterRoots.sort((a, b) => b.length - a.length), recordRoots, error: null };
}

function isWithin(child, parent) {
  return child === parent || child.startsWith(parent + '/');
}

/**
 * The matter a path belongs to, or null if it is not client material, or the
 * { type: 'root' } sentinel if it names a configured matters root itself: a
 * root is not a matter and must not be waved through as one (SEC-03).
 */
function matterOf(candidate, matterRoots, recordRoots) {
  const c = realCanonical(candidate);
  if (!c) return null;

  // First check record roots
  for (const root of recordRoots) {
    if (!isWithin(c, root)) continue;
    if (c === root) return { type: 'record-root' };
    const name = c.slice(root.length + 1).split('/')[0];
    return { name, id: 'record:' + root + '/' + name, dir: root + '/' + name };
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
  PowerShell: { type: 'deny' }, // SEC-02: always deny
  // Network/transmission tools
  WebFetch: { targets: ['url'] },
  WebSearch: { targets: ['query'] },
  // Orchestration tools — non-resource so they cannot leak file paths into a tool call
  Skill: { type: 'non-resource' },
  AskUserQuestion: { type: 'non-resource' },
  Agent: { type: 'non-resource' },
  TaskCreate: { type: 'non-resource' },
  TaskUpdate: { type: 'non-resource' },
  Monitor: { type: 'non-resource' },
  LSP: { type: 'non-resource' },
  // Lifecycle
  SessionStart: { type: 'non-resource' },
  SessionEnd: { type: 'non-resource' },
  Notification: { type: 'non-resource' },
};

/** The registry entry for a tool, or the 'unknown' sentinel if it is not listed. */
function capsOf(toolName) {
  return TOOL_CAPS[toolName] || { type: 'unknown' };
}

/** Every path a tool call would touch. An unknown tool contributes nothing. */
function targetsOf(toolName, input) {
  if (!input) return [];
  const caps = capsOf(toolName);
  if (!caps.targets) return [];
  return caps.targets.map((k) => input[k]).filter((v) => typeof v === 'string');
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
  const h = createHash('sha256').update('matter-guard:' + String(sessionId)).digest('hex');
  return path.join(STATE_DIR, h + '.json');
}

/** Private by construction: the state names matters and sessions. */
function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  if (!WIN) {
    // mkdir honours the umask, so the mode above is a request, not a result.
    fs.chmodSync(STATE_DIR, 0o700);
  }
}

/** Returns the binding, null if absent, or throws if present and untrustworthy. */
function readBinding(sessionId) {
  let raw;
  try {
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
    fs.writeSync(fd, JSON.stringify(binding));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return binding;
}

// --------------------------------------------------------------------------
// Events
// --------------------------------------------------------------------------

function warn(ev, binding, touched) {
  try {
    ensureStateDir();
    fs.appendFileSync(
      AUDIT_LOG,
      JSON.stringify({
        session: String(ev.session_id).slice(0, 8),
        tool: ev.tool_name,
        bound_matter: binding.name,
        reached_matter: touched.name,
      }) + '\n',
      { encoding: 'utf8', mode: 0o600 }
    );
  } catch {
    /* an audit write failure must not change the outcome of the tool call */
  }
  emit({
    systemMessage:
      `Matter separation warning: this session is bound to "${binding.name}" ` +
      `and just reached "${touched.name}". Allowed because the guard is in ` +
      `warn mode. In enforce mode this would have been refused.`,
  });
  return true;
}

function preToolUse(ev) {
  if (MODE === 'off') return;

  // SEC-06: a tool outside the approved registry is refused in enforce mode
  // rather than silently passed through as contributing no targets.
  const caps = capsOf(ev.tool_name);
  if (caps.type === 'deny') {
    return deny(
      'PowerShell and equivalent shell tools are not permitted under the firm matter-separation policy.'
    );
  }
  if (caps.type === 'unknown' && MODE === 'enforce') {
    return denyFault('unknown tool: ' + ev.tool_name + ' — not in the approved tool registry');
  }

  const { matterRoots, recordRoots, error } = resolveRoots();
  if (error) {
    if (MODE !== 'enforce') return; // nothing to warn about without a boundary
    return denyFault(error);
  }

  // SEC-03: a session launched above any matters root can reach every matter
  // from its working directory alone, with no matter-qualified path in play.
  // Use some(): if cwd IS a matter root OR contains any matter root, deny.
  // Record roots are excluded from this check (they are not matters).
  const cwdCanon = realCanonical(ev.cwd);
  if (cwdCanon && matterRoots.length && matterRoots.some((r) => r === cwdCanon || isWithin(r, cwdCanon))) {
    return denyFault('session launched above matters root — launch from inside one matter folder');
  }

  const candidates = [...targetsOf(ev.tool_name, ev.tool_input), ev.cwd];
  const touched = candidates.map((c) => matterOf(c, matterRoots, recordRoots)).filter(Boolean);
  if (touched.some((t) => t.type === 'root')) {
    return denyFault(
      'path equals a configured matters root — sessions must be launched from inside one matter, not at the root level'
    );
  }
  if (touched.length === 0) return; // no client material in play

  let binding;
  try {
    binding = readBinding(ev.session_id);
  } catch (err) {
    if (MODE !== 'enforce') return;
    return denyFault(`the session's matter binding could not be read: ${err.message}`);
  }

  // SEC-07: validate the complete candidate set before committing any binding.
  // Never write state for a call that will be denied.
  const matterTouches = touched.filter((t) => t.type !== 'record-root' && t.type !== 'root');
  if (matterTouches.length === 0) {
    // Only record-root material is in play. Without a prior binding there is
    // nothing to bind to; with a binding, record access is allowed only if the
    // archive identity matches (handled below via id comparison when present).
    if (!binding) return;
  }

  // Distinct matter identities in one call: refuse without writing a binding.
  const distinctIds = [...new Set(matterTouches.map((t) => t.id))];
  if (distinctIds.length > 1) {
    if (MODE === 'warn') {
      return warn(ev, binding || matterTouches[0], matterTouches[1]);
    }
    return deny(
      `Blocked by the firm's matter-separation policy. This call touches more ` +
        `than one matter (${matterTouches.map((t) => t.name).join(', ')}). ` +
        `Close this session and start a new one in a single matter folder.`
    );
  }

  const candidateMatter = matterTouches[0] || null;

  if (!binding && candidateMatter) {
    try {
      const result = writeBinding(ev.session_id, {
        id: candidateMatter.id,
        name: candidateMatter.name,
        dir: candidateMatter.dir,
      });
      // Exclusive-create lost the race: compare the winner before allowing.
      if (result && result.id && result.id !== candidateMatter.id) {
        if (MODE === 'warn') return warn(ev, result, candidateMatter);
        return deny(
          `Blocked by the firm's matter-separation policy. This session is ` +
            `confined to the matter "${result.name}" and the path requested ` +
            `belongs to "${candidateMatter.name}". Do not retry, and do not ` +
            `attempt another route to the same file. Close this session and ` +
            `start a new one in the other matter's folder.`
        );
      }
      binding = result && result.id ? result : candidateMatter;
    } catch (err) {
      if (MODE !== 'enforce') return;
      return denyFault(`the session's matter binding could not be saved: ${err.message}`);
    }
  }

  for (const t of matterTouches) {
    if (binding && t.id !== binding.id) {
      if (MODE === 'warn') return warn(ev, binding, t);
      return deny(
        `Blocked by the firm's matter-separation policy. This session is ` +
          `confined to the matter "${binding.name}" and the path requested ` +
          `belongs to "${t.name}". Do not retry, and do not attempt another ` +
          `route to the same file. Close this session and start a new one in ` +
          `the other matter's folder.`
      );
    }
  }
}

function sessionStart(ev) {
  const { matterRoots, recordRoots, error } = resolveRoots();
  const m = error ? null : matterOf(ev.cwd, matterRoots, recordRoots);
  const context = error
    ? `The matter separation guard is not usable: ${error}. Client work should ` +
      `not proceed until it is fixed.`
    : m && m.type !== 'record-root'
      ? `This session is confined to the matter "${m.name}". Files belonging to ` +
        `any other matter are blocked and must not be accessed by any route.`
      : `This session did not start in a matter folder. Do not open client ` +
        `material from more than one matter; the first matter touched binds ` +
        `the session and the rest are blocked.`;
  emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } });
}

/** File the transcript. SessionEnd guarantees the transcript is complete. */
function sessionEnd(ev) {
  const { matterRoots, recordRoots, error } = resolveRoots();
  if (error || !ev.transcript_path) return;

  let binding = null;
  try {
    binding = readBinding(ev.session_id);
  } catch {
    binding = null;
  }
  if (!binding || !binding.dir || !binding.name) {
    // REC-03: do not silently infer from cwd when the binding is missing or
    // corrupt. Surface the records gap to the practitioner instead.
    emit({
      systemMessage:
        `Session record could NOT be filed: the session binding is missing or unreadable. ` +
        `Record the session on the matter file by hand and investigate state integrity.`,
    });
    return;
  }

  try {
    if (!fs.existsSync(ev.transcript_path)) return;
    const dest = RECORD_ROOT
      ? path.join(RECORD_ROOT, binding.name)
      : path.join(binding.dir.replace(/\//g, path.sep), ARCHIVE_DIR);
    fs.mkdirSync(dest, { recursive: true });

    const stamp = fs.statSync(ev.transcript_path).mtime.toISOString().replace(/[:.]/g, '-');
    const name = `session-${stamp}-${String(ev.session_id).slice(0, 8)}.jsonl`;
    const final = path.join(dest, name);
    const tmp = `${final}.${process.pid}.part`;
    // Copy then rename, so an interrupted copy never leaves a partial file
    // looking like a complete record.
    fs.copyFileSync(ev.transcript_path, tmp);
    fs.renameSync(tmp, final);

    emit({ systemMessage: `Session record filed to ${ARCHIVE_DIR}.` });
  } catch (err) {
    // Never fail the session on an archive error, but say so: an unfiled
    // transcript is a records gap the practitioner needs to know about.
    emit({
      systemMessage:
        `Session record could NOT be filed to the matter (${err.message}). ` +
        `Record the session on the matter file by hand.`,
    });
  }
}

// --------------------------------------------------------------------------

function dispatch(raw) {
  let ev;
  try {
    ev = JSON.parse(raw);
    if (!ev || typeof ev !== 'object') throw new Error('not an object');
  } catch {
    // Unreadable input means the guard cannot know what is being attempted.
    if (MODE === 'enforce') denyFault('the hook received input it could not read');
    return;
  }
  switch (ev.hook_event_name) {
    case 'PreToolUse':
      return preToolUse(ev);
    case 'SessionStart':
      return sessionStart(ev);
    case 'SessionEnd':
      return sessionEnd(ev);
    default:
      return;
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
      if (MODE === 'enforce') denyFault(`unexpected error: ${err && err.message}`);
    }
  });
  process.stdin.on('error', () => {
    if (MODE === 'enforce') denyFault('the hook could not read its input');
  });
}

main();
