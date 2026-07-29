#!/usr/bin/env node
/**
 * matter-guard — keeps one session to one matter, and files the transcript.
 *
 * Handles three hook events, dispatched on hook_event_name:
 *
 *   PreToolUse    binds the session to the first matter it touches and denies
 *                 any later path under a different matter
 *   SessionEnd    copies the completed transcript into the matter folder
 *   SessionStart  injects a reminder naming the bound matter (advisory only:
 *                 SessionStart cannot block)
 *
 * Configuration, via the managed settings env block:
 *
 *   CLAUDE_MATTER_ROOTS  required. Semicolon-separated list of every path that
 *                        denotes the matters root. List each alias the share
 *                        answers to: the IP form, the hostname form, and any
 *                        drive letter staff map to it. A root that is not
 *                        listed is not recognised as client material.
 *   CLAUDE_MATTER_ARCHIVE  optional. Subfolder of the matter to receive
 *                          transcripts. Default "_ai-record".
 *
 * Enforcement is client-side. It constrains the model, not a determined user.
 * On macOS and WSL2 pair it with the Bash sandbox, which the OS enforces.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ARCHIVE_DIR = process.env.CLAUDE_MATTER_ARCHIVE || '_ai-record';

/**
 * Where the session record is filed.
 *   unset  the matter's own folder, under ARCHIVE_DIR
 *   set    <CLAUDE_RECORD_ROOT>/<matter>, a single designated archive
 * A central archive is easier to place under one retention and destruction
 * schedule; the matter folder keeps the record beside the file it belongs to.
 */
const RECORD_ROOT = process.env.CLAUDE_RECORD_ROOT || '';

/**
 * enforce  block cross-matter access (default)
 * warn     allow it, but say so and write an audit line, for a rollout that
 *          observes before it blocks
 * off      do nothing
 */
const MODE = (process.env.CLAUDE_MATTER_MODE || 'enforce').toLowerCase();

const STATE_DIR = path.join(
  process.env.LOCALAPPDATA || os.tmpdir(),
  'claude-matter-guard'
);
const AUDIT_LOG = path.join(STATE_DIR, 'would-have-blocked.log');

/** Paths under these are client material. Compared canonically, never raw. */
function matterRoots() {
  const raw = process.env.CLAUDE_MATTER_ROOTS || '';
  return raw
    .split(';')
    .map((s) => canonical(s))
    .filter(Boolean);
}

/**
 * Reduce a path to a comparable form: forward slashes, lowercase, no trailing
 * separator. Windows paths are case-insensitive and arrive in several shapes —
 * UNC, extended-length, and mapped drives all denote the same share.
 */
function canonical(p) {
  if (!p) return '';
  let s = String(p).trim().replace(/\\/g, '/');
  s = s.replace(/^\/\/\?\/unc\//i, '//'); // \\?\UNC\host\share
  s = s.replace(/^\/\/\?\//, ''); // \\?\C:\...
  s = s.toLowerCase();

  // Resolve "." and ".." before comparing. Without this, a path such as
  // <matter>/../<other matter> keeps the bound matter as its first segment
  // and walks straight out of the boundary.
  const unc = s.startsWith('//');
  const parts = (unc ? s.slice(2) : s).split('/');
  const prefix = unc ? parts.splice(0, 2) : []; // host and share stay fixed
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
  return (unc ? '//' : '') + joined.replace(/\/+$/, '');
}

/** True when child is at or below parent, on a segment boundary. */
function isWithin(child, parent) {
  return child === parent || child.startsWith(parent + '/');
}

/**
 * The matter a path belongs to: the first segment below a matters root.
 * Returns null for anything that is not client material.
 */
function matterOf(candidate) {
  const c = canonical(candidate);
  if (!c) return null;
  for (const root of matterRoots()) {
    if (!isWithin(c, root)) continue;
    if (c === root) return null; // the root itself is not a matter
    const name = c.slice(root.length + 1).split('/')[0];
    // Identity is the matter name, not the path. Every configured root is an
    // alias of the same share, so the same matter reached by its IP, its
    // hostname or a mapped drive must compare equal. `dir` keeps the real
    // location, which identity deliberately discards.
    return { root, name, full: 'matter:' + name, dir: root + '/' + name };
  }
  return null;
}

/** Every path a tool call would touch. Unknown tools contribute nothing. */
function targetsOf(toolName, input) {
  if (!input) return [];
  const pick = (...keys) => keys.map((k) => input[k]).filter(Boolean);
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return pick('file_path');
    case 'NotebookEdit':
      return pick('notebook_path', 'file_path');
    case 'Grep':
    case 'Glob':
      return pick('path');
    case 'Bash':
      return []; // confined by cwd; see the note on Bash in the README
    default:
      return [];
  }
}

function statePath(sessionId) {
  return path.join(STATE_DIR, `${String(sessionId).replace(/[^\w-]/g, '')}.json`);
}

function readBinding(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
  } catch {
    return null;
  }
}

function writeBinding(sessionId, binding) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(statePath(sessionId), JSON.stringify(binding), 'utf8');
  } catch {
    /* a state write failure must not break the session; the next call rebinds */
  }
}

/**
 * Emit on fd 1 synchronously. process.stdout.write is asynchronous when stdout
 * is a pipe, which is exactly how the hook runner invokes this, and a process
 * that ends with a queued write loses it. A lost deny is a silent allow.
 */
function emit(obj) {
  fs.writeSync(1, JSON.stringify(obj));
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

/**
 * Warn mode: allow the access, but record it and say so. The log is what makes
 * the observation period worth running — it is the list of accesses that
 * enforce mode would have refused, which is the evidence for turning it on.
 */
function warn(ev, binding, touched) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(
      AUDIT_LOG,
      JSON.stringify({
        session: ev.session_id,
        tool: ev.tool_name,
        bound_matter: binding.name,
        reached_matter: touched.name,
      }) + '\n',
      'utf8'
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

  // Fail closed in enforce mode. If the guard is installed but unconfigured it
  // cannot tell client material from anything else, and a guard that quietly
  // enforces nothing is worse than no guard: the practice believes it is
  // protected. In warn mode there is nothing to warn about, so it stands down.
  if (matterRoots().length === 0) {
    if (MODE !== 'enforce') return;
    return deny(
      `The matter separation guard is installed but CLAUDE_MATTER_ROOTS is ` +
        `not set, so it cannot identify client material and is refusing all ` +
        `file access. This is a deployment fault, not a decision about this ` +
        `task. Report it to the AI Officer before continuing any client work. ` +
        `To run the guard without enforcing it while the matters root is ` +
        `being set up, set CLAUDE_MATTER_MODE=warn.`
    );
  }

  const candidates = [...targetsOf(ev.tool_name, ev.tool_input), ev.cwd];
  const touched = candidates.map(matterOf).filter(Boolean);
  if (touched.length === 0) return; // no client material in play

  let binding = readBinding(ev.session_id);

  for (const t of touched) {
    if (!binding) {
      binding = { matter: t.full, name: t.name, dir: t.dir };
      writeBinding(ev.session_id, binding);
      continue;
    }
    if (t.full !== binding.matter) {
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
  const m = matterOf(ev.cwd);
  const context = m
    ? `This session is confined to the matter "${m.name}". Files belonging to ` +
      `any other matter are blocked and must not be accessed by any route.`
    : `This session did not start in a matter folder. Do not open client ` +
      `material from more than one matter; the first matter touched binds the ` +
      `session and the rest are blocked.`;
  emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } });
}

/** File the transcript on the matter. SessionEnd guarantees it is complete. */
function sessionEnd(ev) {
  const binding = readBinding(ev.session_id) || matterOf(ev.cwd);
  if (!binding || !binding.dir || !binding.name || !ev.transcript_path) return;

  try {
    if (!fs.existsSync(ev.transcript_path)) return;
    // binding.dir is the real location; binding.matter is an identity token
    // and is deliberately not a path.
    const dest = RECORD_ROOT
      ? path.join(RECORD_ROOT, binding.name)
      : path.join(binding.dir.replace(/\//g, path.sep), ARCHIVE_DIR);
    fs.mkdirSync(dest, { recursive: true });
    const stamp = fs
      .statSync(ev.transcript_path)
      .mtime.toISOString()
      .replace(/[:.]/g, '-');
    const name = `session-${stamp}-${String(ev.session_id).slice(0, 8)}.jsonl`;
    fs.copyFileSync(ev.transcript_path, path.join(dest, name));
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

function dispatch(raw) {
  let ev;
  try {
    ev = JSON.parse(raw);
  } catch {
    // Unreadable input means the guard cannot know what to block. It allows,
    // which is fail-open: see the limitation noted in the README.
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

/**
 * Read the event from stdin. Streamed rather than read from fd 0, because a
 * synchronous read of the pipe throws on Windows, and a throw here silently
 * disables enforcement.
 */
function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });
  process.stdin.on('end', () => dispatch(raw));
  process.stdin.on('error', () => {});
}

main();
