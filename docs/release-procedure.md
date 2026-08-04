# Release procedure

This procedure turns the repository gates into release evidence for a controlled beta deployment. It does not certify professional compliance. The deploying practice remains responsible for the legal, privacy, records and security decisions recorded in the release checklist.

## 1. Prepare the release candidate

1. Start from a clean checkout.
2. Confirm the branch and tag names identify the beta status, for example `release/v0.1.0-beta.1` and `v0.1.0-beta.1`.
3. Run the automated validation suite listed in `docs/release-checklist.md`.
4. Do not tag while `git status` is dirty or while any owner-dependent gate is unresolved.

## 2. Render the deploying practice's settings

Create `dist/matter-definition.json` from the approved matter registry, then render the production settings outside the tracked template values:

```bash
python3 scripts/generate-matter-sandbox.py \
  --matter-definition dist/matter-definition.json \
  --output dist/sandbox-policy.json

python3 scripts/render-production-settings.py \
  --firm-name "<practice name>" \
  --org-uuid "<Claude org UUID>" \
  --matter-roots "<absolute matter root>[;<alias>]" \
  --otel-endpoint "https://<collector>/v1/traces" \
  --sandbox-policy dist/sandbox-policy.json

python3 scripts/preflight-validate.py --mode production dist/managed-settings.production.json
```

If telemetry is deliberately disabled, use `--disable-telemetry` and record the reason in the release notes and in the practice's records schedule.

## 3. Generate and verify the manifest

```bash
python3 scripts/generate-release-manifest.py \
  --output dist/release-manifest.json \
  --production-settings dist/managed-settings.production.json \
  --sandbox-policy dist/sandbox-policy.json

# If the working tree is dirty and the deployment process deliberately accepts that state:
#   python3 scripts/generate-release-manifest.py --allow-dirty ...

python3 scripts/generate-release-manifest.py \
  --verify \
  --output dist/release-manifest.json \
  --production-settings dist/managed-settings.production.json \
  --sandbox-policy dist/sandbox-policy.json
```

The manifest records hashes of the hook, settings template, rendered production settings, compliance skill and dependency lock file. Signature of the manifest is a deployment responsibility outside this repository.

## 4. Run manual release gates

Run these on the certified platform path for the release candidate:

1. `claude doctor`, confirming managed settings are loaded.
2. `/status` in a real session, confirming managed settings and hooks are in force.
3. `CLAUDE_E2E=1 node tests/e2e.test.js` on a signed-in Claude Code installation.
4. A real cross-matter refusal smoke test with the rendered settings.
5. A sandbox availability check proving `sandbox.failIfUnavailable` refuses unprotected use.
6. A `SessionEnd` transcript filing check, including one failure path observed by the external records service.
7. Data-flow observation and owner sign-off under `docs/data-flow-model.md`.

Record the command output, commit SHA, manifest hash, operator, date and evidence location for each gate.

## 5. Confirm supply-chain and repository protections

Before the tag is created, verify:

- all GitHub Actions referenced by workflows are pinned to full commit SHAs;
- Python dependencies install with `--require-hashes` from `requirements-lock.txt`;
- settings validation uses the cached schema and recorded SHA-256 hash;
- the unpinned `claude-code-review` workflow is absent unless vendored and reviewed;
- repository secret scanning and push protection are enabled in GitHub settings;
- branch protection requires the named CI jobs, code-owner review and no force pushes; and
- release rollback artefacts exist.

## 6. Approval and rollback

The release owner records approval only after every automated gate, manual gate and owner-dependent register is complete. The rollback bundle must include:

```text
managed-settings.json
hooks/matter-guard.js
skills/ai-policy-compliance/SKILL.md
release-manifest.json
```

Rollback succeeds only when a new session loads the previous settings, cross-matter refusal works, and the manifest signature verifies.
