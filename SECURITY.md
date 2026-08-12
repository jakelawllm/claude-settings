# Security

## Status

This is a beta reference implementation. It has not had independent security review. Do not treat it as a dependable control until it has.

## What is and is not a security boundary

Read this before relying on any part of it.

**The operating system sandbox is the boundary.** That is what contains a Bash command and its child processes. The template ships with `failIfUnavailable: false` for deployment observation periods. A production deployment MUST set this to true.

**The matter guard is not a boundary on its own.** `hooks/matter-guard.js` constrains the model, not a determined user. It covers a fixed list of file tools, does not parse shell commands, and does not see tools it has not been told about — new built-ins, plugin tools and MCP tools included. On a machine without the sandbox it is advisory for those routes. Native Windows has no equivalent OS sandbox; the guard is advisory for Bash on that platform. Production deployments should use macOS, Linux, or Windows with Claude Code inside WSL2.

**Managed settings are a client-side control.** Anthropic's documentation is explicit that on an unmanaged device a user does not need administrator rights to bypass them. Deployment through MDM to a managed device is what makes them hold.

**The MCP allowlist ships empty.** A `serverName` entry matches a display name chosen by whoever configures the server, so it does not identify one. Use an exact URL or command.

## Production-rendered settings workflow

The checked-in `managed-settings.json` is a deployment template. It carries `REPLACE-WITH-...` placeholders, runs the guard in observation mode, and tolerates a missing sandbox. Do not deploy it as-is.

Render a practice-specific file without committing its values:

```bash
python3 scripts/render-production-settings.py \
  --firm-name "Example Legal" \
  --org-uuid 11111111-2222-3333-4444-555555555555 \
  --matter-roots "/srv/matters;/mnt/matters" \
  --otel-endpoint "https://collector.example.internal/v1/traces"
python3 scripts/preflight-validate.py --mode production dist/managed-settings.production.json
```

The renderer accepts corresponding environment variables, defaults to the gitignored `dist/managed-settings.production.json`, rewrites the literal hook path when required, and refuses to write an output containing a placeholder. Template preflight and production preflight are deliberately different: template placeholders are warnings; production placeholders, `warn` mode and `failIfUnavailable: false` are blockers. This is an engineering readiness gate, not a compliance certification. See `docs/release-checklist.md` for the manual gates.

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
