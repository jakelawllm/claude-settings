# Production Architecture

This document describes the correct production architecture for deploying this repository in a legal practice handling confidential client matters.

## Architecture layers

Three layers in descending order of enforcement authority:

### 1. OS isolation (primary boundary)

Each Claude Code session for a confidential matter must run inside a process environment that can only see the selected matter's filesystem plus approved tooling paths.

**Certified path (the only supported production path in this release):**

- **Linux with a container runtime (podman or Docker)**, or
- **WSL2 running the same Linux container path**.

The container (or equivalent mount namespace) is the primary filesystem and network isolation boundary. Claude's own sandbox policy is a second, narrower layer inside that boundary — not a substitute for it.

**Not certified:**

| Platform | Status |
|---|---|
| Linux container / podman / Docker | Certified |
| WSL2 with the same container path | Certified |
| macOS with Claude sandbox alone | Open question — not certified in this release |
| Native Windows | Unsupported — must be refused technically |

Enabling `sandbox.enabled: true` is necessary but not sufficient for per-matter isolation. Claude's sandbox permits reads across the whole machine unless a per-matter `sandbox.filesystem` policy is also configured. This repository ships `scripts/generate-matter-sandbox.py` to emit that policy from a validated matter definition. The committed `managed-settings.json` remains a **deployment template** and does not contain a per-matter filesystem policy.

This repository documents the per-matter launcher pattern below as a contract. It does **not** ship a launcher, container runtime, host firewall, or records service. A practice adopting this configuration must supply those outside this repository.

### 2. Matter guard (defence in depth)

`hooks/matter-guard.js` enforces one-session-one-matter for file tools (Read, Edit, Write, Grep, Glob, NotebookEdit) and unknown tools. It provides defence in depth against accidental cross-matter access at the model level.

With the OS isolation layer in place, the hook's role is to catch accidental access that the OS sandbox would permit (for example a Read call to a file outside the expected matter path) and to enforce the matter binding in the session state.

Without the OS isolation layer, the hook does not prevent a determined user or a prompt-injected session from using Bash, Python, Node, or another interpreter to read another matter. Bash is bound by working directory only; the command string is not parsed.

### 3. Compliance skill (conduct layer)

`skills/ai-policy-compliance/SKILL.md` governs what Claude may produce and what must be said about it. It is not a security boundary.

## Sandbox policy generator

`scripts/generate-matter-sandbox.py` is the only code in this repository that crosses from configuration into deployment. It:

1. reads one approved matter definition JSON;
2. validates absolute POSIX roots, placeholders, native Windows targets, nested/overlapping roots, and aliases outside the declared root;
3. emits a Claude sandbox policy fragment with `allowManagedReadPathsOnly: true`, `allowManagedDomainsOnly: true`, a broad `denyRead`, a narrow matter `allowRead`, credential denials, and the matter's domain allowlist;
4. writes atomically (temp file + rename) with LF newlines, or writes nothing and exits non-zero on any fault.

It does not create containers, mount filesystems, start processes, or manage records.

Example:

```bash
python3 scripts/generate-matter-sandbox.py \
  --matter-definition /path/to/matter-definition.json \
  --output /path/to/sandbox-policy.json
```

## Per-matter launcher contract (outside this repository)

The launcher lives outside this repository. For a confidential-matter session it must:

1. resolve the matter from the approved registry and refuse unknown, root, ancestor or ambiguous paths;
2. verify the release manifest hashes for settings, hook, skill and sandbox policy;
3. create the container with only the matter path and approved tooling paths mounted;
4. install the rendered settings and generated sandbox policy inside it;
5. set the working directory to the matter folder;
6. bind the session to the matter before tools become available;
7. start Claude, and refuse to start if any preceding step failed — including native Windows, absent sandbox primitive, policy hash mismatch, visible sibling matter, absent hook.

## OS isolation acceptance procedure (manual / host-dependent)

This is a manual gate, not a CI-runnable full OS audit. Observation, not assertion, is the standard. The opt-in E2E suite only checks whether a canary appears in final assistant text, which cannot distinguish "never opened" from "opened and not mentioned".

### Preconditions

- Two synthetic matters (Matter A and Matter B) with a canary file in Matter B that never belongs in Matter A.
- The certified Linux container (or WSL2 container) path, with the generated sandbox policy for Matter A installed.
- An OS-level open/read observer: `auditd`, eBPF, `fanotify`, Endpoint Security, or container audit logs.
- A deliberately sabotaged matter-guard negative control that attempts to open the Matter B canary (so a broken OS boundary is forced to fail the test).

### Procedure

1. Start a session for Matter A only, under the certified isolation path.
2. Attempt direct and indirect reads of the Matter B canary via `Read`, `Grep`, `Glob`, `cat`, Python, Node, Git, archives, symlinks, subprocesses and background commands.
3. Confirm the canary bytes never reach a tool result or the model context.
4. Confirm credential paths and protected environment variables are unreadable from any sandboxed subprocess.
5. Confirm no canary reaches an unapproved host by any available route.
6. Confirm the launcher refuses startup on unknown matter, absent sandbox primitive, policy hash mismatch, visible sibling matter, absent hook, or native Windows.
7. Run the sabotaged-guard negative control: if the OS observer still records an open/read of Matter B, the isolation boundary has failed even if the assistant text stays clean.

A written record of the observer used, the host, the date, and the pass/fail result belongs with the practice's operational evidence — not in this repository.

## Supported platforms for production (confidential matters)

| Platform | Bash isolation | Supported for confidential matters |
|---|---|---|
| Linux container (podman/Docker) | Mount namespace + generated sandbox policy | Yes — certified |
| WSL2 with the same container path | Linux namespace inside WSL2 | Yes — certified |
| macOS with Claude sandbox alone | Open question | Not certified in this release |
| Native Windows | None | No — must be refused technically |

## Deployment checklist

See README.md Production go/no-go checklist section for the full operational checklist.
