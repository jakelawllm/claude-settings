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
const MODE_VALID = ['enforce', 'warn', 'off'].includes(MODE);

const STATE_DIR =
  process.env.CLAUDE_MATTER_STATE_DIR ||
  path.join(process.env.LOCALAPPDATA || os.homedir() || os.tmpdir(), 'claude-matter-guard');
const AUDIT_LOG = path.join(STATE_DIR, 'would-have-blocked.log');
const STATE_VERSION = 1;
const MAX_BINDING_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Emit on fd 1 synchronously: an async write lost at exit is a silent allow.
 * Returns false when the write failed so callers can fall back to exit 2.
 */
function emit(obj) {
  try {
    fs.writeSync(1, JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function deny(reason) {
  const wrote = emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
  // SEC-06: exit 2 is the only reliable PreToolUse block if stdout failed.
  if (!wrote) {
    process.exit(2);
  }
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
 *
 * SEC-09: returns a typed result. Empty/unresolved targets must deny in
 * enforce mode rather than disappear from the candidate set as non-client.
 *   { ok: true, path }           — resolved
 *   { ok: false, reason: 'empty' | 'too-long' | 'unresolved' }
 */
function realCanonicalTyped(p) {
  if (!p) return { ok: false, reason: 'empty' };
  if (String(p).length > 4096) {
    return { ok: false, reason: 'too-long' };
  }
  let current = String(p);
  const tail = [];
  for (let i = 0; i < 64; i++) {
    try {
      const resolved = fs.realpathSync(current);
      const pathOut = canonical(tail.length ? path.join(resolved, ...tail.reverse()) : resolved);
      if (!pathOut) return { ok: false, reason: 'unresolved' };
      return { ok: true, path: pathOut };
    } catch {
      const parent = path.dirname(current);
      if (!parent || parent === current) break;
      tail.push(path.basename(current));
      current = parent;
    }
  }
  return { ok: false, reason: 'unresolved' };
}

/** String form for callers that only need a path; empty means unresolved. */
function realCanonical(p) {
  const r = realCanonicalTyped(p);
  return r.ok ? r.path : '';
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
  if (raw.length === 0) return { roots: [], error: 'CLAUDE_MATTER_ROOTS is not set' };

  const placeholders = raw.filter((r) => PLACEHOLDER.test(r) && !fs.existsSync(r));
  if (placeholders.length) {
    return { roots: [], error: 'CLAUDE_MATTER_ROOTS still contains the shipped placeholder' };
  }
  const relative = raw.filter((r) => !isAbsolutePath(r));
  if (relative.length) {
    return { roots: [], error: `CLAUDE_MATTER_ROOTS contains a relative path: ${relative[0]}` };
  }

  const present = raw.filter((r) => {
    try {
      return fs.existsSync(r);
    } catch {
      return false;
    }
  });
  // Resolved to real paths, not canonicalised lexically. Targets are resolved
  // (a symlink out of a matter must be caught), so a root that is not would
  // never match one: on macOS /var is a symlink to /private/var, and a matters
  // root under it compared unequal to every path inside it. Nothing looked
  // like client material and the guard permitted everything.
  const usable = present.map(realCanonical).filter(Boolean);
  if (usable.length === 0) {
    return { roots: [], error: 'no configured matters root is reachable from this machine' };
  }
  // Deduplicate: multiple configured roots that resolve to the same canonical
  // path are one root under different aliases (IP form, hostname form, a
  // mapped drive letter) — collapsing them is the whole point of allowing
  // more than one entry in CLAUDE_MATTER_ROOTS, so this is silent, not fatal.
  // Two configured roots that are genuinely distinct locations are still kept
  // separate, and the root-qualified matter identity below (SEC-05) prevents
  // a same-named matter under two distinct roots from being treated as one.
  const seenRoots = new Set();
  const deduped = usable.filter((r) => {
    if (seenRoots.has(r)) return false;
    seenRoots.add(r);
    return true;
  });
  usable.length = 0;
  deduped.forEach((r) => usable.push(r));

  // Separate matter roots from record roots (SEC-04).
  // Record roots are NOT matter roots — they are only used for archiving.
  const recordRootCanon = RECORD_ROOT ? realCanonical(RECORD_ROOT) : null;
  const matterRoots = usable.filter(r => r !== recordRootCanon);
  const recordRoots = usable.filter(r => r === recordRootCanon);

  // Longest first: an archive nested inside the matters root must match as the
  // archive, not be read as a matter named after its own folder.
  return {
    matterRoots: matterRoots.sort((a, b) => b.length - a.length),
    recordRoots: recordRoots.sort((a, b) => b.length - a.length),
    error: null
  };
}

function isWithin(child, parent) {
  return child === parent || child.startsWith(parent + '/');
}

/**
 * The matter a path belongs to, or null if it is not client material, or the
 * { type: 'root' } sentinel if it names a configured matters root itself: a
 * root is not a matter and must not be waved through as one (SEC-03).
 *
 * Pass candidate roots as a single combined list. Record-roots must be added
 * separately so an archive directory inside the record root matches the archive
 * rather than its first path segment.
 */
function matterOf(candidate, matterRoots, recordRootCanon) {
  const c = realCanonical(candidate);
  if (!c) return null;

  // Check record root first: nested archives must win by length.
  // Paths under RECORD_ROOT/<hash>/<matter>/... belong to that matter.
  // SessionEnd files to <hash>/<matter>/ where hash is first 16 hex chars of binding.id hash.
  // For compatibility, also accept <matter>/ (no hash prefix).
  if (recordRootCanon && isWithin(c, recordRootCanon) && c !== recordRootCanon) {
    const relative = c.slice(recordRootCanon.length + 1);
    const segments = relative.split('/');
    if (segments.length >= 1 && segments[0]) {
      let name, dir;
      // Check if first segment is a 16-char hex hash
      if (segments.length >= 2 && /^[0-9a-f]{16}$/i.test(segments[0])) {
        // New structure: <hash>/<matter>/...
        name = segments[1];
        dir = recordRootCanon + '/' + segments[0] + '/' + name;
      } else {
        // Old structure: <matter>/...
        name = segments[0];
        dir = recordRootCanon + '/' + name;
      }
      const canonicalMatterRoot = matterRoots[0] || recordRootCanon;
      return { name, id: 'matter:' + canonicalMatterRoot + '/' + name, dir };
    }
  }

  // Check matter roots
  for (const root of matterRoots) {
    if (!isWithin(c, root)) continue;
    if (c === root) return { type: 'root' };
    const name = c.slice(root.length + 1).split('/')[0];
    return { name, id: 'matter:' + root + '/' + name, dir: root + '/' + name };
  }

  return null;
}

/**
 * Explicit capability registry (FUNC-01 / design §3.3): every tool this guard
 * reasons about, and how. A tool absent from this list is 'unknown' rather
 * than silently contributing no targets, so a new built-in, plugin or MCP tool
 * cannot reach client material through a gap in a switch statement.
 *
 * INVENTORY SOURCE. The tool names below are taken from the Claude Code tools
 * reference (https://code.claude.com/docs/en/tools-reference), read on
 * 4 August 2026. Nothing here is invented. The reference is the authority: when
 * the certified Claude Code version changes, the inventory must be re-read and
 * this registry regenerated, because an unclassified tool stops working rather
 * than failing open.
 *
 * INVENTORY COMPLETENESS. The built-in list is complete as at that reading.
 * MCP tools (`mcp__<server>__<tool>`) and plugin tools are NOT enumerable from
 * the reference and are therefore not classified: they deny in enforce mode.
 * That is the intended direction, but it means an approved MCP server must be
 * added here explicitly before its tools can be used.
 *
 * Categories:
 *   filesystem    — path targets, checked against the matter binding
 *   bash          — working directory only; the command string is not parsed
 *   deny          — always refused
 *   non-resource  — no path targets and no transmission
 *   network       — no local path targets; egress is bounded elsewhere
 *   transmission  — sends session content off the machine
 *   orchestration — session and workflow control; no path targets
 */
const TOOL_CAPS = {
  // -- filesystem: the tools that name a path -----------------------------
  Read: { type: 'filesystem', targets: ['file_path'] },
  Edit: { type: 'filesystem', targets: ['file_path'] },
  Write: { type: 'filesystem', targets: ['file_path'] },
  NotebookEdit: { type: 'filesystem', targets: ['notebook_path', 'file_path'] },
  Grep: { type: 'filesystem', targets: ['path'] },
  Glob: { type: 'filesystem', targets: ['path'] },
  LSP: { type: 'filesystem', targets: ['file_path', 'path'] },

  // -- process ------------------------------------------------------------
  // Bash and Monitor both execute shell commands and are bound by working
  // directory only. The command string is not parsed; see the head of the file.
  Bash: { type: 'bash' },
  Monitor: { type: 'bash' },
  PowerShell: { type: 'deny' },

  // -- directory-changing: these move the session's working directory ------
  // Both are refused: the working directory is the boundary the guard binds to,
  // and a tool that relocates it can carry the session out of its matter.
  EnterWorktree: { type: 'deny' },
  ExitWorktree: { type: 'deny' },

  // -- transmission: sends session content off this machine ---------------
  Artifact: { type: 'deny' },
  SendUserFile: { type: 'deny' },
  ShareOnboardingGuide: { type: 'deny' },
  RemoteTrigger: { type: 'deny' },
  PushNotification: { type: 'deny' },

  // -- network: fetches material in, no local path target ------------------
  // Not denied here. Transmission control belongs in managed permissions, and
  // duplicating it in the guard would make one control look like two.
  WebFetch: { type: 'network' },
  WebSearch: { type: 'network' },

  // -- orchestration ------------------------------------------------------
  // Skill must be allowed or skills/ai-policy-compliance cannot run, which is
  // the defect FUNC-01 records. AskUserQuestion must be allowed or the skill
  // cannot put the approval question the policy requires.
  Skill: { type: 'orchestration' },
  AskUserQuestion: { type: 'orchestration' },
  Agent: { type: 'orchestration' },
  Workflow: { type: 'orchestration' },
  SendMessage: { type: 'orchestration' },
  TaskCreate: { type: 'orchestration' },
  TaskGet: { type: 'orchestration' },
  TaskList: { type: 'orchestration' },
  TaskUpdate: { type: 'orchestration' },
  TaskStop: { type: 'orchestration' },
  TaskOutput: { type: 'orchestration' },
  TodoWrite: { type: 'orchestration' },
  EnterPlanMode: { type: 'orchestration' },
  ExitPlanMode: { type: 'orchestration' },
  ReportFindings: { type: 'orchestration' },
  ToolSearch: { type: 'orchestration' },
  WaitForMcpServers: { type: 'orchestration' },
  ListMcpResourcesTool: { type: 'orchestration' },
  ReadMcpResourceTool: { type: 'orchestration' },
  CronCreate: { type: 'orchestration' },
  CronDelete: { type: 'orchestration' },
  CronList: { type: 'orchestration' },
  ScheduleWakeup: { type: 'orchestration' },

  // -- non-resource -------------------------------------------------------
  // EndConversation is documented as exempt from PreToolUse hooks, so the guard
  // never sees it. It is classified for completeness, not because it is reached.
  EndConversation: { type: 'non-resource' },
  Notification: { type: 'non-resource' },
  SessionStart: { type: 'non-resource' },
  SessionEnd: { type: 'non-resource' },
};

/** The registry entry for a tool, or the 'unknown' sentinel if it is not listed. */
function capsOf(toolName) {
  return TOOL_CAPS[toolName] || { type: 'unknown' };
}

/**
 * Extract path targets from a tool invocation based on the tool's capability.
 */
function targetsOf(toolName, toolInput) {
  const caps = capsOf(toolName);
  if (caps.type !== 'filesystem') return [];
  if (!toolInput || typeof toolInput !== 'object') return [];
  const out = [];
  for (const key of caps.targets || []) {
    const val = toolInput[key];
    if (val) out.push(val);
  }
  return out;
}

/**
 * For SEC-09: collect candidates and their typed canonical results.
 * Returns { touched, unresolved, nonClient } where unresolved is the set of
 * candidates that failed to resolve (empty, too-long, or unresolvable).
 */
function collectCandidates(ev, matterRoots, recordRootCanon) {
  const candidates = [...targetsOf(ev.tool_name, ev.tool_input), ev.cwd];
  const touched = [];
  const unresolved = [];
  for (const c of candidates) {
    const r = realCanonicalTyped(c);
    if (!r.ok) {
      unresolved.push({ candidate: c, reason: r.reason });
      continue;
    }
    const m = matterOf(r.path, matterRoots, recordRootCanon);
    if (m) touched.push(m);
  }
  return { touched, unresolved };
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
  if (!b || typeof b.id !== 'string' || typeof b.name !== 'string' || typeof b.dir !== 'string' ||
      b.version !== STATE_VERSION ||
      !b.createdAt ||
      (Date.now() - b.createdAt) > MAX_BINDING_AGE_MS) {
    throw new Error('binding is malformed or expired');
  }
  return b;
}

/**
 * Atomic exclusive create (SEC-03). On EEXIST, reread and compare: identical
 * binding is a no-op; mismatch throws so the caller denies.
 * Returns the durable binding record that is now on disk.
 */
function writeBinding(sessionId, binding) {
  ensureStateDir();
  const target = statePath(sessionId);
  const record = {
    version: STATE_VERSION,
    id: binding.id,
    name: binding.name,
    dir: binding.dir,
    createdAt: Date.now(),
    hostUser: process.env.USER || process.env.USERNAME || 'unknown',
    hostEnv: process.platform,
  };
  let fd;
  try {
    fd = fs.openSync(target, 'wx', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(record));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return record;
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      const existing = readBinding(sessionId);
      if (!existing) {
        throw new Error('binding file exists but could not be read after race');
      }
      if (existing.id !== record.id) {
        const err = new Error('binding conflict: session already bound to a different matter');
        err.code = 'ECONFLICT';
        err.existing = existing;
        throw err;
      }
      return existing;
    }
    throw e;
  }
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

  // SEC-08: validate mode is known before proceeding
  if (!MODE_VALID) {
    return denyFault(`CLAUDE_MATTER_MODE must be enforce, warn, or off; got ${MODE}`);
  }

  // SEC-06: a tool outside the approved registry is refused in enforce mode
  // rather than silently passed through as contributing no targets.
  const caps = capsOf(ev.tool_name);
  if (caps.type === 'deny') {
    return deny(
      'This tool is not permitted under the firm matter-separation policy.'
    );
  }
  if (caps.type === 'unknown' && MODE === 'enforce') {
    return denyFault('unknown tool: ' + ev.tool_name + ' — not in the approved tool registry');
  }

  const { matterRoots, error } = resolveRoots();
  if (error) {
    if (MODE !== 'enforce') return; // nothing to warn about without a boundary
    return denyFault(error);
  }

  // SEC-04: a session launched above a matters root can reach every matter
  // from its working directory alone, with no matter-qualified path in play.
  // Evaluate only matter roots (not record roots) with some().
  const cwdCanon = realCanonical(ev.cwd);
  if (cwdCanon && matterRoots.length && matterRoots.some((r) => r === cwdCanon || isWithin(r, cwdCanon))) {
    return denyFault('session launched above matters root — launch from inside one matter folder');
  }

  // Record root canonical for matterOf
  const recordRootCanon = RECORD_ROOT ? realCanonical(RECORD_ROOT) : null;

  const { touched, unresolved } = collectCandidates(ev, matterRoots, recordRootCanon);

  // SEC-09: a canonicalisation failure is a resolution failure, not evidence
  // that the path is non-client. Deny in enforce mode rather than silently
  // dropping the candidate from the set considered.
  if (unresolved.length && MODE === 'enforce') {
    return denyFault(
      `a path could not be canonicalised (${unresolved[0].reason}) — cannot verify it stays within one matter`
    );
  }

  if (touched.some((t) => t.type === 'root')) {
    return denyFault(
      'path equals a configured matters root — sessions must be launched from inside one matter, not at the root level'
    );
  }
  if (touched.length === 0) return; // no client material in play

  // SEC-07: validate complete candidate set before writing any binding.
  // Never bind on a call that will be denied.
  let binding;
  try {
    binding = readBinding(ev.session_id);
  } catch (err) {
    if (MODE !== 'enforce') return;
    return denyFault(`the session's matter binding could not be read: ${err.message}`);
  }

  // First, check if any touched matter differs from existing binding.
  // If so, deny the call WITHOUT writing a new binding.
  for (const t of touched) {
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

  // SEC-07: never bind on a call that will be denied. If the candidate set
  // already contains more than one matter, refuse without writing state.
  if (!binding && touched.length > 0) {
    const firstId = touched[0].id;
    const mixed = touched.find((t) => t.id !== firstId);
    if (mixed) {
      if (MODE === 'warn') return warn(ev, { name: touched[0].name }, mixed);
      return deny(
        `Blocked by the firm's matter-separation policy. This request reaches ` +
          `more than one matter ("${touched[0].name}" and "${mixed.name}") and ` +
          `cannot bind the session. Start a session inside one matter only.`
      );
    }
    try {
      // Test-only seam: sleep before exclusive create so concurrent first
      // calls can be forced to race. Production never sets this.
      if (process.env.CLAUDE_MATTER_TEST_DELAY_MS) {
        const ms = Number(process.env.CLAUDE_MATTER_TEST_DELAY_MS) || 0;
        if (ms > 0) {
          const end = Date.now() + ms;
          while (Date.now() < end) {
            /* busy-wait: Atomics.wait is unavailable without SharedArrayBuffer */
          }
        }
      }
      writeBinding(ev.session_id, {
        id: touched[0].id,
        name: touched[0].name,
        dir: touched[0].dir,
      });
    } catch (err) {
      if (MODE !== 'enforce') return;
      if (err && err.code === 'ECONFLICT') {
        return deny(
          `Blocked by the firm's matter-separation policy. This session is ` +
            `confined to the matter "${err.existing.name}" and the path requested ` +
            `belongs to "${touched[0].name}". Do not retry, and do not attempt another ` +
            `route to the same file. Close this session and start a new one in ` +
            `the other matter's folder.`
        );
      }
      // Without durable state the next call rebinds, and the session can
      // move between matters one call at a time.
      return denyFault(`the session's matter binding could not be saved: ${err.message}`);
    }
  }
}

function sessionStart(ev) {
  const { matterRoots, error } = resolveRoots();
  const recordRootCanon = RECORD_ROOT ? realCanonical(RECORD_ROOT) : null;
  const m = error ? null : matterOf(ev.cwd, matterRoots, recordRootCanon);
  const context = error
    ? `The matter separation guard is not usable: ${error}. Client work should ` +
      `not proceed until it is fixed.`
    : m
      ? `This session is confined to the matter "${m.name}". Files belonging to ` +
        `any other matter are blocked and must not be accessed by any route.`
      : `This session did not start in a matter folder. Do not open client ` +
        `material from more than one matter; the first matter touched binds ` +
        `the session and the rest are blocked.`;
  emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } });
}

/** File the transcript. SessionEnd guarantees the transcript is complete. */
function sessionEnd(ev) {
  const { error } = resolveRoots();
  if (error || !ev.transcript_path) return;

  // REC-03: treat unreadable or inconsistent binding as an archive exception.
  // Do not silently fall back to cwd-derived matterOf.
  let binding = null;
  let bindingError = null;
  try {
    binding = readBinding(ev.session_id);
  } catch (err) {
    bindingError = err;
    binding = null;
  }

  if (!binding) {
    // REC-01/02/03: corrupt/missing binding must not guess an archive path.
    // Emit an alert and do not write a record.
    emit({
      systemMessage:
        `Session record could NOT be filed: binding unreadable or inconsistent ` +
        `(${bindingError ? bindingError.message : 'no binding'}). ` +
        `Place the transcript in quarantine and raise an operational alert.`,
    });
    return;
  }

  // Use stable matter ID from binding; archive directory uses binding.name only
  // for human readability. The directory structure under RECORD_ROOT uses the
  // binding's id for uniqueness when matters share names across roots.
  if (!binding.dir || !binding.name) return;

  try {
    if (!fs.existsSync(ev.transcript_path)) return;
    const dest = RECORD_ROOT
      ? path.join(
          RECORD_ROOT,
          createHash('sha256').update(binding.id).digest('hex').slice(0, 16),
          binding.name
        )
      : path.join(binding.dir.replace(/\//g, path.sep), ARCHIVE_DIR);
    fs.mkdirSync(dest, { recursive: true });

    const stamp = fs.statSync(ev.transcript_path).mtime.toISOString().replace(/[:.]/g, '-');
    // REC-02: use full domain-separated session hash for filename uniqueness.
    const sessionHash = createHash('sha256').update('matter-guard:' + String(ev.session_id)).digest('hex').slice(0, 16);
    const name = `session-${stamp}-${sessionHash}.jsonl`;
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
