# Release checklist

This checklist is for a practice preparing a controlled release candidate from this beta reference implementation. It does not make the repository a production compliance package. It records the engineering evidence that must exist before a practice can make its own go/no-go decision.

## Release naming

Use a release-candidate branch and tag that make the beta status plain:

```text
branch: release/v0.1.0-beta.1
tag:    v0.1.0-beta.1
```

Do not create a tag until every required gate below is complete and the repository is clean.

## Artefacts

A release candidate should have these artefacts:

- the tracked source tree at the release tag;
- a rendered managed settings file for the deploying practice, usually `dist/managed-settings.production.json`;
- the managed hook at the platform path referenced by that rendered file;
- the `skills/ai-policy-compliance/` directory installed beside the managed settings file;
- recorded output from the validation commands below;
- a rollback copy of the previous known-good managed-policy bundle.

The rendered production settings file must not be committed. It contains firm-specific deployment values.

## Required automated validation

Run from a clean checkout before tagging:

```bash
node tests/matter-guard.test.js
node tests/preflight-validate.test.js
python3 scripts/check-clause-refs.py
python3 scripts/scan-history.py
python3 scripts/preflight-validate.py --mode template managed-settings.json
```

Regenerate policy Markdown into temporary files and confirm there is no drift from the authoritative DOCX files:

```bash
for d in ai-policy-legal-practice-template ai-protocol-barristers-chambers; do
  python3 scripts/docx-to-md.py "$d.docx" "/tmp/$d.regen.md"
  diff -u "$d.md" "/tmp/$d.regen.md"
done
```

Render the deploying practice's settings and validate production preconditions:

```bash
python3 scripts/render-production-settings.py \
  --firm-name "<practice name>" \
  --org-uuid "<Claude org UUID>" \
  --matter-roots "<absolute matter root>[;<alias>]" \
  --otel-endpoint "https://<collector>/v1/traces"

python3 scripts/preflight-validate.py --mode production dist/managed-settings.production.json
```

If the practice deliberately disables telemetry, record the reason and render with the explicit telemetry-disabled option provided by the renderer. Production preflight will warn that the record gap must be addressed in the practice's own Schedules 1 and 8.

## Required manual validation

These gates depend on the deployment environment and cannot be proven by public CI:

- `claude doctor` on one machine per supported platform, confirming the managed settings file loaded and no managed keys were stripped;
- `/status` in a real session, confirming managed settings and hooks are in force;
- `CLAUDE_E2E=1 node tests/e2e.test.js` on a signed-in Claude Code installation;
- a real cross-matter refusal smoke test using the rendered production settings;
- a sandbox availability check showing that Claude Code refuses to run unprotected when `sandbox.failIfUnavailable` is true;
- a `SessionEnd` transcript filing check showing the record lands under the correct matter `_ai-record` directory or the configured central archive;
- platform exclusion evidence confirming native Windows is not treated as hard matter isolation.

Record the command output or artefact path for each gate in the release notes.

## Do not tag until

- [ ] Git status is clean.
- [ ] CI is green on Ubuntu, macOS and Windows.
- [ ] Policy Markdown parity is clean against both DOCX files.
- [ ] Clause and schedule reference validation passes.
- [ ] Full-history secret and identifying-detail scan passes.
- [ ] Template preflight mode passes against `managed-settings.json`.
- [ ] Production preflight mode passes against the rendered settings file.
- [ ] Live E2E has passed on a signed-in Claude Code installation.
- [ ] OS sandbox availability and fail-closed behaviour have been checked in the target environment.
- [ ] The hook installed path matches the command in the rendered settings file.
- [ ] Transcript filing has been checked.
- [ ] Independent security review is complete, or a responsible principal has expressly waived it for an internal beta only.
- [ ] The expert-report mismatch has been resolved or expressly accepted as a documented policy decision by the adopting practice.
- [ ] The deployment owner and rollback owner are named.

## Installation check

Install the managed bundle to the platform's managed-policy directory:

```text
macOS         /Library/Application Support/ClaudeCode/managed-settings.json
Linux, WSL    /etc/claude-code/managed-settings.json
```

Install the hook and skill beside it:

```text
<system directory>/hooks/matter-guard.js
<system directory>/skills/ai-policy-compliance/SKILL.md
```

The hook command in the rendered settings file is literal JSON. It must match the installed path for the platform. A Linux path in a macOS deployment is a broken guard, not a portability feature.

Native Windows is not a production hard-isolation target for confidential Bash use. Use Windows with Claude Code inside WSL2 if the boundary needs to hold.

## Rollback

Before rollout, keep a copy of the previous known-good managed-policy bundle:

```text
managed-settings.json
hooks/matter-guard.js
skills/ai-policy-compliance/SKILL.md
```

Rollback procedure:

1. Stop new Claude Code sessions.
2. Replace the managed settings, hook and skill with the previous known-good bundle.
3. Run `claude doctor` on one machine per supported platform.
4. Start a new real session and check `/status`.
5. Run `node tests/matter-guard.test.js` against the rollback hook source.
6. Run a cross-matter refusal smoke test in a real session.
7. Record the rollback time, machine, operator, reason and verification output.

Rollback verification succeeds only when a new session loads the previous settings, the hook path is valid, and cross-matter refusal works in a real session.

## Remaining caveats

A release tag proves only that these repository gates passed at that revision. It does not prove that a practice has satisfied its professional obligations, that the operating system sandbox actually worked on every target machine, or that the deployment remains correct after Claude Code settings change. Re-check after every Claude Code upgrade and before adding any built-in, plugin or MCP tool surface.
