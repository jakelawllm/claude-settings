# Security

## Status

This is a beta reference implementation. It has not had independent security review. Do not treat it as a dependable control until it has.

## What is and is not a security boundary

Read this before relying on any part of it.

**The accepted operating system/container environment is the boundary.** It must contain Bash and its child processes. The template ships with `failIfUnavailable: false` for synthetic observation only. Rendered deployment settings require true and a single-matter policy; host acceptance is still required.

**The matter guard is not a boundary on its own.** Its wildcard PreToolUse matcher denies unknown tools in enforce mode. It does not parse shell commands. New tools require deliberate registry classification. Native Windows has no equivalent OS sandbox and is unsupported for confidential-matter isolation. Linux containers, including inside WSL2, are supported deployment designs subject to host acceptance; macOS sandbox-alone is not certified. No repository test certifies a host.

**Managed settings are a client-side control.** Anthropic's documentation is explicit that on an unmanaged device a user does not need administrator rights to bypass them. Managed-device distribution helps control installation; accepted OS and launcher restrictions must also prevent alternate clients or processes bypassing that policy.

**The MCP allowlist ships empty.** A `serverName` entry matches a display name chosen by whoever configures the server, so it does not identify one. Use an exact URL or command.

## Reporting a vulnerability

Report privately. Do not open a public issue, and do not include client information, matter names or file paths from a real deployment in a report.

Use GitHub's private vulnerability reporting on this repository, under **Security → Report a vulnerability**.

Please include the affected file and version, what an attacker or a careless user can achieve, the platform and Claude Code version, and a reproduction if you have one. A finding that the guard permits something the documentation says it prevents is in scope, and is the finding most worth having.

## Supported versions

Only the current `main`. There are no tagged releases yet, and no backports.

The declared range is `requiredMinimumVersion` through `requiredMaximumVersion`; it is not a claim that all versions were tested. Unknown or changed keys can stop enforcing policy. Re-check effective settings and the tool inventory against the client after upgrades, including `claude doctor`, `/status`, synthetic refusal/archival and host isolation acceptance.

## Known limitations carried deliberately

| Limitation | Why it is accepted |
|---|---|
| Bash confined by working directory, not by parsing commands | Command parsing is defeatable; the OS sandbox is the real containment |
| Unknown-tool default-deny in enforce mode | The wildcard matcher and capability registry mean unknown tools are refused in enforce mode; the registry must be extended when new tools are added |
| The WebFetch domain check sends the hostname to Anthropic | The setting that suppresses it also disables the malicious-domain blocklist, which is the worse trade |
| Native Windows unsupported for matter isolation | No OS-level sandbox exists there |

## Current internal review

See [readiness](docs/INTERNAL_MVP_READINESS_REPORT.md) and [remaining issues](docs/INTERNAL_MVP_REMAINING_ISSUES.md). Use synthetic material in warn/off mode: it permits cross-matter operations and may archive the whole conversation under its first binding.

Session state and archives must be inaccessible to other users. The hook refuses corrupt bindings, ambiguous roots, unresolved paths and unsafe archive destinations. It cannot eliminate filesystem replacement races between a hook check and the tool's later open; accepted OS isolation remains necessary.

The optional GitHub Claude workflow is disabled by default, verifies repository write permission and has no OIDC grant under the static-token option. Its token rotation is external to this repository and is not required for the offline MVP checks.
