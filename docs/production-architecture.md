# Production Architecture

This document describes the correct production architecture for deploying this repository in a legal practice handling confidential client matters.

## Architecture layers

Three layers in descending order of enforcement authority:

### 1. OS isolation (primary boundary)

Each Claude Code session must run inside a process environment that can only see the selected matter's filesystem. Options:
- **macOS:** Apple Silicon or Intel Mac with Claude Code sandbox enabled (sandbox.enabled: true, sandbox.failIfUnavailable: true)
- **Linux:** Container, mount namespace, or dedicated OS account per matter
- **Windows:** WSL2 with a Linux environment — native Windows has no sandbox equivalent and must not be used for confidential Bash use

That said, enabling the operating system sandbox with `sandbox.enabled: true` is necessary but not sufficient for per-matter isolation. Claude's sandbox permits reads across the whole machine unless a per-matter `sandbox.filesystem` policy is also configured. This repository does not yet ship the generator that emits that policy. Until it does, the baseline contained in `managed-settings.json` is **not** a per-matter Bash containment on its own.

This repository documents the per-matter launcher pattern below as a contract. It does **not** ship a launcher. A practice adopting this configuration must supply its own launcher, container runtime, or namespace setup that creates the isolated filesystem view, verifies the release manifest, sets the working directory to the matter folder, and refuses to start Claude if any preceding step fails. Native Windows is not supported and the launcher must refuse it technically.

### 2. Matter guard (defence in depth)

hooks/matter-guard.js enforces one-session-one-matter for file tools (Read, Edit, Write, Grep, Glob, NotebookEdit) and unknown tools. It provides defence in depth against accidental cross-matter access at the model level.

With the OS isolation layer in place, the hook's role is to catch accidental access that the OS sandbox would permit (e.g. a Read call to a file outside the expected matter path) and to enforce the matter binding in the session state.

Without the OS isolation layer, the hook does not prevent a determined user or a prompt-injected session from using Bash, Python, Node, or another interpreter to read another matter.

### 3. Compliance skill (conduct layer)

skills/ai-policy-compliance/SKILL.md governs what Claude may produce and what must be said about it. It is not a security boundary.

## Per-matter launcher pattern

Before starting a Claude Code session for a specific matter:
1. Resolve the matter root path.
2. Launch Claude Code with the session's working directory set to that matter's folder.
3. Confirm sandbox.failIfUnavailable is true and the sandbox is available before allowing the session to start.
4. The hook binds the session to the first matter it touches.

## Supported platforms for production (confidential matters)

| Platform | Bash isolation | Supported |
|---|---|---|
| macOS with sandbox | OS sandbox | Yes |
| Linux container/namespace | Mount namespace | Yes |
| Windows with WSL2 | Linux namespace inside WSL2 | Yes |
| Native Windows | None | No — advisory only |

## Deployment checklist

See README.md Production go/no-go checklist section for the full operational checklist.
