# Repository instructions

## Scope and workflow

This public repository is a beta Claude Code configuration and policy reference, not a web application or a production compliance package. These instructions apply throughout the repository; CLAUDE.md points here. Read README.md, CONTRIBUTING.md, SECURITY.md, and the relevant docs before changing controls.

Use a dedicated branch and logical commits. Preserve unrelated changes and inspect open PRs before implementing overlapping fixes. Do not merge, force-push, rewrite history, or deploy device policy without explicit authorization. External contributions remain unsupported; this workflow is for the maintainer and authorised adaptations.

## Setup and checks

Use Node.js 22 LTS and Python 3.12 with Git. There is no npm dependency install, database, migration, web server, or compiled application.

```text
python -m venv .venv
python -m pip install --require-hashes -r requirements-lock.txt
python scripts/verify.py
```

Activate the virtual environment before the pip and verification commands (see README). The runner sets PYTHON to its interpreter for child tests. Run the relevant `node tests/<name>.test.js` during development, then the full runner. Do not comment out tests to select cases. CI must pass all three hook-platform jobs, settings and policy, and secret scan.

Live `CLAUDE_E2E=1 node tests/e2e.test.js` is separate, uses synthetic data, requires an authenticated Claude CLI and spends model tokens. Never equate static policy-text tests or assistant refusals with OS isolation. Host acceptance requires the procedure in docs/os-isolation-acceptance.md.

## Control invariants

- The hook must fail closed in enforce mode on malformed input, invalid configuration, unresolved paths and state errors. Use process-level regression tests; include refusal assertions.
- PreToolUse uses wildcard `*`. Unknown tools deny; register new tools explicitly. Bash is evaluated by cwd only. The OS/container boundary must contain interpreters.
- Checked-in managed settings are a placeholder template in warn mode. Deploy only a rendered file with production checks and completed host acceptance.
- Do not weaken production governance gates or fabricate owners, evidence, approvals or test passes. Synthetic fixtures exercise validation, not approval.
- Matter roots are parent directories containing matter folders. A single-matter sandbox root is the selected child directory. Keep these distinct.
- State persists across hook invocations. Do not discard or infer corrupt bindings; old central archives require an operator-controlled migration (see operations).
- Keep agent runtime directories such as `.claude-orch/` ignored. Build inspection snapshots from explicitly selected tracked files; never include a private agent home or authentication volume.
- Container ownership checks must include the runtime UID, effective parent-directory permissions and actual mount read-only flags. Never treat an offline network-none probe as an authenticated approved-egress test.
- Protect host ancestors of the launcher, verification key, bundle and selected matter from group/world replacement; a private child beneath a writable parent is insufficient. Keep signing keys outside runtime mounts.
- Verify the actual managed Bash tool result, installed Skill invocation and SessionEnd archive. A zero client exit can contain a failed tool result; a standalone bubblewrap probe can pass while the client shell or dynamic loader is hidden.
- Diagnostic argv/environment can contain ephemeral proxy credentials. Allowlist filesystem/namespace fields before printing or saving; never retain full execve arguments or authentication output.
- Rendered settings, state, transcripts, real organisation identifiers and credentials must stay out of Git. Use only synthetic test data. Scanners must not print matched secrets, including secrets in filenames or exception text.
- Pin Actions by full SHA and Python dependencies with hashes; preserve Windows conditional dependencies when regenerating the lock.

## Documents

The two policy DOCX files are authoritative; their Markdown counterparts are generated. Edit DOCX and regenerate with scripts/docx-to-md.py; never hand-edit generated policy Markdown. Preserve LF output and check parity and clause semantic anchors. The expert-report Option A prohibition is an intentional owner decision; do not reopen it as a wording cleanup.

Update README, architecture, operations, environment reference and readiness reports with affected behavior. Keep dated historical decisions intact and add a dated superseding note. Do not describe an unobserved platform/version as certified. No independent security or legal certification has been supplied.

The files research.md, policy-review*.md and the original readiness/planning reports are gitignored local review records. If absent, say so; do not claim their findings were reconciled.
