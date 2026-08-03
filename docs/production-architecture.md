# Production Architecture

This document describes the correct production architecture for deploying this repository in a legal practice handling confidential client matters.

## Architecture layers

Three layers in descending order of enforcement authority:

### 1. OS isolation (primary boundary)

Each Claude Code session must run inside a process environment that can only see the selected matter's filesystem. Options:
- **macOS:** Apple Silicon or Intel Mac with Claude Code sandbox enabled (sandbox.enabled: true, sandbox.failIfUnavailable: true)
- **Linux:** Container, mount namespace, or dedicated OS account per matter
- **Windows:** WSL2 with a Linux environment — native Windows has no sandbox equivalent and must not be used for confidential Bash use

The OS isolation layer contains Bash and all other shell access. The hook cannot do this — only the OS can.

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

## Production-rendered settings

The checked-in `managed-settings.json` is a deployment template. It ships with placeholders, observation-mode defaults, and a sandbox that tolerates its own absence. A production deployment uses a rendered file, not the template:

```bash
python3 scripts/render-production-settings.py \
  --firm-name "Example Legal" \
  --org-uuid 11111111-2222-3333-4444-555555555555 \
  --matter-roots "/srv/matters;/mnt/matters" \
  --otel-endpoint "https://collector.example.internal/v1/traces" \
  --hook-path "/etc/claude-code/hooks/matter-guard.js"

python3 scripts/preflight-validate.py --mode production dist/managed-settings.production.json
```

The renderer writes a gitignored path by default. Firm-identifying values must never enter the repository or its history. Template preflight and production preflight answer different questions: placeholders are expected in the template and blockers in a rendered production file.

## OS isolation validation

The matter guard is defence in depth, not the primary Bash boundary. Before production use, prove the OS isolation layer on the target platform:

1. Confirm `sandbox.enabled: true` and `sandbox.failIfUnavailable: true` in the rendered settings.
2. Confirm Claude Code refuses to start when the sandbox is unavailable.
3. Confirm a Bash command cannot reach another matter from inside a real session.
4. On Windows, use WSL2. Native Windows has no hard isolation path for confidential Bash use.

Unit tests of the hook cannot prove OS isolation. They prove only that the guard's own path and mode checks still hold.

## Live E2E requirement

Before a release candidate is tagged, run:

```bash
CLAUDE_E2E=1 node tests/e2e.test.js
```

This is a manual gate. It needs a signed-in Claude Code installation, spends tokens, and does not run in public CI. Record the output or artefact path in the release notes. The unit suite alone is not enough to claim that Claude Code actually invokes the hook with the payload it sends.

## Deployment checklist

See `README.md` Production go/no-go checklist and `docs/release-checklist.md` for the full operational checklist, rollback path, and do-not-tag-until gates.
