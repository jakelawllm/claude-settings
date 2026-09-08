# claude-code-for-lawyers

A beta reference configuration for Claude Code used by trusted internal users in an Australian legal practice. It combines managed settings, a session-to-matter hook, a conduct skill and policy templates.

**Internal-MVP scope: READY for the prepared synthetic test.** The [delegated owner acceptance](docs/policy-decisions/internal-mvp-owner-acceptance.md) completes the operational decisions for the exact tested Linux installation. Use its signed adapter through the [operator runbook](docs/synthetic-container-checks.md); no further owner sign-off is needed for invented-data evaluation. The repository provides local tooling, not an accepted confidential-matter environment. Read the [current assessment](docs/INTERNAL_MVP_READINESS_REPORT.md) and [remaining issues](docs/INTERNAL_MVP_REMAINING_ISSUES.md) before widening scope.

This has not had independent security or legal certification and is not a production compliance package. Practitioner decisions remain necessary.

## Implemented components

| Component | Behavior |
|---|---|
| managed-settings.json | Organisation-scope template: permission restrictions, managed hook/MCP controls, login restriction, telemetry and standing instruction. Contains placeholders, warn mode and failIfUnavailable=false. |
| settings.json | Personal convenience settings; no managed hook, organisation restriction or per-matter sandbox. |
| matter-settings.json | Optional project restriction denying WebFetch and WebSearch. |
| hooks/matter-guard.js | Binds sessions, checks registered tool paths, denies unknown tools in enforce mode and copies SessionEnd transcripts. |
| skills/ai-policy-compliance/SKILL.md | Instructions for refusals, approval, verification worklists and records. Instructions cannot guarantee model behavior. |
| scripts/generate-matter-sandbox.py | Validates one matter definition and writes a sandbox fragment. |
| scripts/render-production-settings.py | Renders deployment values and combines the sandbox fragment with hardened settings. |
| scripts/preflight-validate.py | Template checks or stricter production configuration and evidence checks. |
| scripts/generate-release-manifest.py | Generates/verifies artifact hashes and declared version range; does not sign or install releases. |
| Policy DOCX files | Authoritative practice policy and separate barristers/chambers protocol. Markdown counterparts are generated. |

There is no web UI, API service, database, migration, queue or daemon. No launcher, container image, host firewall or records service is shipped. The external records-event schema is a contract; the hook produces a JSONL convenience copy, not that event.

## Runtime and clean setup

Use Node.js 22 LTS, Python 3.12 and Git. Node has no npm dependencies. Python dependencies are pinned and hash-locked. Windows supports repository tests and POSIX artifact generation, but not confidential-matter isolation.

```text
git clone https://github.com/jakelawllm/claude-settings.git
cd claude-settings
```

Activate on Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Or on Linux/macOS:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
```

Then, on either platform:

```text
python -m pip install --require-hashes -r requirements-lock.txt
python scripts/verify.py
```

If PowerShell policy prevents activation, invoke .venv/Scripts/python.exe for both commands. Offline checks need no secrets or database. The [configuration reference](docs/environment.md) explains JSON examples and optional renderer inputs; scripts do not load .env files.

## Shortest internal-user workflow

1. Run the full verification command. It drives real hook subprocesses, persistence, archives, refusal paths and release CLIs using synthetic data.
2. Generate and inspect a single-matter bundle using [operations](docs/operations.md). Synthetic examples do not authorize client use.
3. On an authenticated Claude installation, run the opt-in integration test:

```bash
CLAUDE_E2E=1 node tests/e2e.test.js
```

```powershell
$env:CLAUDE_E2E = '1'
$env:CLAUDE_E2E_CLI = 'C:\path\to\installed\claude.exe'
node tests/e2e.test.js
Remove-Item Env:CLAUDE_E2E
Remove-Item Env:CLAUDE_E2E_CLI
```

Replace the Windows CLI path with the installed native executable or package JavaScript entry point; the harness does not run a command-shell shim. This calls the model and spends tokens. It checks hook invocation with temporary synthetic files; it does not install managed policy. Never put client material in the harness.

For six optional synthetic conduct samples, set `CLAUDE_COMPLIANCE_LIVE=1` instead of `CLAUDE_E2E` and run `node tests/compliance-live.js` with the same CLI path. This explicitly invokes the skill and checks ordinary assistance, injection handling and prohibited-content refusals. Samples require human review and are not a mandatory CI gate. See [configuration](docs/environment.md) for optional local result capture.

For an installed internal session, confirm the intended account and effective settings, start Claude in one synthetic matter, read/summarise it, attempt a sibling read, end the session and inspect its archive. Follow [start, stop and recovery](docs/operations.md) and complete [OS acceptance](docs/os-isolation-acceptance.md) before sensitive material.

## Checks and build

`python scripts/verify.py` runs all offline suites, Node/Python syntax, dependency consistency, schema/hash checks, DOCX parity, clause references, local Markdown links, history/pending-change and Office scanners, preflight and manifest verification. Live E2E is explicitly separate.

Focused tests use `node tests/<name>.test.js`. There is no standalone linter, formatter, type checker or compiled application. Bundle generation is the release build; git diff --check and syntax/schema checks are the static gates.

CI runs the hook on Linux, macOS and Windows and the full runner on Linux. The optional maintainer Claude workflow is disabled unless enabled separately; it is unnecessary for ordinary checks.

## Isolation and records

**The matter guard is not a security boundary on its own.** PreToolUse uses wildcard `*`; unknown tools deny in enforce mode. Bash is confined by working directory only: the hook does not parse command strings. A command can address a sibling unless the OS boundary prevents it.

Sandbox alone, without a per-matter `sandbox.filesystem` policy and an accepted host/container deployment, does not establish isolation. Only the Linux container path and WSL2 running the same container path are supported deployment designs here. Neither is certified by repository tests. macOS sandbox-alone is an open question and is not certified in this release. Native Windows is unsupported.

Matter roots are parent directories; each direct child is a matter. Start a new session when changing matters. Bindings survive hook process restarts. Invalid/corrupt bindings are refused; do not recover by guessing from cwd.

SessionEnd writes a convenience transcript copy with restrictive creation permissions. It does not implement encryption, durable ingestion, retention, legal hold or alerting. Central archives separate same-name matters with a full identity hash. Read [records and retention](docs/records-and-retention.md) and [the external handoff contract](docs/records-schema.md).

## Installation and version policy

Install only rendered settings after the [release procedure](docs/release-procedure.md) and host acceptance. Managed-policy paths:

```text
Linux/WSL2 container: /etc/claude-code/managed-settings.json
macOS policy tooling: /Library/Application Support/ClaudeCode/managed-settings.json
Windows policy tooling: C:\Program Files\ClaudeCode\managed-settings.json
```

Install the hook under `hooks/` and the compliance skill under `.claude/skills/ai-policy-compliance/` inside the managed-policy directory. On Linux the skill path is `/etc/claude-code/.claude/skills/ai-policy-compliance/SKILL.md`; the repository source remains `skills/ai-policy-compliance/SKILL.md`. The literal hook command must match its installed path; the renderer defaults to Linux. Installing the template verbatim is not a deployment.

The declared range is 2.1.251 to 2.1.300. The minimum avoids a telemetry destination-override problem fixed in 2.1.251; the maximum is a policy cap, not evidence all versions passed. Record the actual client during acceptance and recheck upgrades. See [Claude monitoring documentation](https://code.claude.com/docs/en/monitoring-usage).

## Confidentiality and policy

Managed telemetry content gates are explicitly zero. Metrics/logs can still contain identity metadata and do not form a verbatim transmission record. Use the collector base URL, without /v1/traces. Local cleanupPeriodDays does not control supplier retention. Keep transcripts out of consumer sync.

Before client work, approve the account, contract, retention, restricted-information handling and records process. A consumer privacy toggle does not satisfy the policy's contractual requirement. Use the [supplier register](docs/supplier-evidence-register.md), [legal-source register](docs/legal-source-register.md) and [data-flow record](docs/data-flow-model.md).

The expert-report prohibition is intentional: [Option A](docs/policy-decisions/expert-report-rule.md). Citation verification remains practitioner work. The barristers protocol has independent numbering and is not wired into this skill.

## Further documentation

- [Agent instructions](AGENTS.md) and [contributing](CONTRIBUTING.md)
- [Architecture](docs/production-architecture.md), [operations](docs/operations.md) and [configuration](docs/environment.md)
- [Security and private reporting](SECURITY.md)
- [Release checklist](docs/release-checklist.md) and [operational evidence](docs/operational-evidence-register.md)
- [Synthetic container checks and recovery](docs/synthetic-container-checks.md)
- [Change history](CHANGELOG.md)

MIT. Published for reference and adaptation; external contributions are not monitored.
