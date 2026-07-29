# Security

## Status

This is a beta reference implementation. It has not had independent security review. Do not treat it as a dependable control until it has.

## What is and is not a security boundary

Read this before relying on any part of it.

**The operating system sandbox is the boundary.** `managed-settings.json` enables it with `failIfUnavailable`, so a session refuses to start where it cannot run. That is what contains a Bash command and its child processes.

**The matter guard is not a boundary on its own.** `hooks/matter-guard.js` constrains the model, not a determined user. It covers a fixed list of file tools, does not parse shell commands, and does not see tools it has not been told about — new built-ins, plugin tools and MCP tools included. On a machine without the sandbox it is advisory for those routes, and native Windows has no sandbox.

**Managed settings are a client-side control.** Anthropic's documentation is explicit that on an unmanaged device a user does not need administrator rights to bypass them. Deployment through MDM to a managed device is what makes them hold.

**The MCP allowlist ships empty.** A `serverName` entry matches a display name chosen by whoever configures the server, so it does not identify one. Use an exact URL or command.

## Reporting a vulnerability

Report privately. Do not open a public issue, and do not include client information, matter names or file paths from a real deployment in a report.

Use GitHub's private vulnerability reporting on this repository, under **Security → Report a vulnerability**.

Please include the affected file and version, what an attacker or a careless user can achieve, the platform and Claude Code version, and a reproduction if you have one. A finding that the guard permits something the documentation says it prevents is in scope, and is the finding most worth having.

## Supported versions

Only the current `main`. There are no tagged releases yet, and no backports.

The configuration targets the Claude Code version in `requiredMinimumVersion`. Settings keys change between releases: a key that is renamed or removed is silently stripped from a managed file, so a configuration can stop enforcing something without any error. Re-check against the Claude Code settings documentation after upgrading, and treat `claude doctor` output as part of the upgrade.

## Known limitations carried deliberately

| Limitation | Why it is accepted |
|---|---|
| Bash confined by working directory, not by parsing commands | Command parsing is defeatable; the sandbox is the real containment |
| Fixed tool list in the guard | A default-deny on unknown tools would break ordinary work; the list is documented so the gap is visible |
| The WebFetch domain check sends the hostname to Anthropic | The setting that suppresses it also disables the malicious-domain blocklist, which is the worse trade |
| Native Windows unsupported for matter isolation | No OS-level sandbox exists there |
