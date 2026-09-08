# Internal test operations

Use synthetic material until the remaining deployment requirements are complete. The offline tools create no server, database, migrations or durable records service.

## Prepare and verify

Follow [README setup](../README.md). Run python scripts/verify.py from the checkout. Production preflight refuses native Windows even though static artifact generation and hook tests are supported there.

Generate a synthetic bundle on any test host:

```text
python scripts/generate-matter-sandbox.py --matter-definition examples/matter-definition.json --output dist/sandbox-policy.json
python scripts/render-production-settings.py --firm-name "Synthetic Practice" --org-uuid "11111111-2222-4333-8444-555555555555" --matter-roots "/synthetic-matters" --otel-endpoint "https://synthetic-otel.example.invalid" --sandbox-policy dist/sandbox-policy.json --output dist/managed-settings.production.json
```

Repeat rendering only with an intentional --force if the output exists. The generated allowlist contains Smith only; the hook parent root is /synthetic-matters. The .invalid endpoint and sample UUID are test data, not working services.

Production preflight uses repository governance by default and must fail while its registers remain incomplete:

```text
python scripts/preflight-validate.py --mode production dist/managed-settings.production.json
```

To test the positive synthetic evidence path on Linux, run `python scripts/verify.py`. It copies explicitly labelled fixtures into a temporary directory and dates them relative to the test day. It never modifies real evidence. For a direct check with the checked-in illustrative dates:

```text
python scripts/preflight-validate.py --mode production --evidence-root test-fixtures test-fixtures/synthetic-production.json
```

This demonstrates validator behavior and never approves a deployment. Fixed fixture dates can expire; a failed freshness check is expected after their next-review date. Record installed Claude's actual version, then use --claude-code-version with that value when generating a deployment manifest. A synthetic verification example is:

```text
python scripts/generate-release-manifest.py --claude-code-version 2.1.263 --output dist/release-manifest.json --production-settings dist/managed-settings.production.json --sandbox-policy dist/sandbox-policy.json
python scripts/generate-release-manifest.py --verify --claude-code-version 2.1.263 --output dist/release-manifest.json --production-settings dist/managed-settings.production.json --sandbox-policy dist/sandbox-policy.json
```

Generation requires a clean tree. --allow-dirty is for development evidence only and must not be used to label a deployable release. Sign/verify using the approved external deployment process.

## Start, use and stop an installed test environment

The deploying operator supplies the Linux/WSL2 container/launcher described in [architecture](production-architecture.md). This repository does not install it. Mount only the selected synthetic matter and required tooling; keep credentials, sibling matters and host control sockets unavailable.

Install the rendered settings and `hooks/matter-guard.js` in the managed-policy directory, and copy the repository compliance skill to `.claude/skills/ai-policy-compliance/SKILL.md` within that directory (`/etc/claude-code/.claude/skills/ai-policy-compliance/SKILL.md` on Linux). Verify the manifest, then run claude doctor and inspect /status in a new Claude session. Confirm the intended organisation and policy sources. If the hook cannot launch or the sandbox is unavailable, stop testing; do not remove protection to continue.

Start Claude in the selected matter directory. Ask for a summary of a synthetic text file, attempt a sibling-matter Read and search, and confirm denials. End the session with /exit. Confirm its JSONL archive exists and can be read by the authorised operator. A fresh Claude session is required to change matter; restarting a hook process preserves the old session binding.

Run the live harness separately using the command in README. Its temporary settings test hook integration and do not replace managed host acceptance. Confirm the installed compliance skill appears in `/skills` and invoke it through the actual Skill tool without `--plugin-dir`; the separate conduct harness side-loads a plugin and cannot establish managed-skill discovery.

See [synthetic container checks](synthetic-container-checks.md) for mount syntax, effective parent-directory permissions, separate authentication and offline boundaries, and the subsequently repaired nested sandbox. The pinned test image requires its documented filesystem layout and host profiles; do not substitute an image merely because a standalone bubblewrap probe passes.

## Failure and recovery

| Symptom | Action and verification |
|---|---|
| Missing/invalid configuration | Re-render with valid inputs; rerun preflight. Do not use warn/off as a fix. |
| Hook cannot launch | Compare command path, Node availability and file permissions to installed bundle. Start a new synthetic session and confirm hook invocation. |
| Cross-matter denial | Open a fresh session in the correct matter. Do not rewrite the binding to another matter. |
| Corrupt or missing binding | Stop the affected session; retain state and transcript in approved storage for diagnosis; correct root/configuration and start a new session. Do not file by cwd guess. |
| SessionEnd archive error | Preserve source transcript before local cleanup, manually copy to approved records storage and verify the copy's hash; record the gap. The hook has no operator alerting service. |
| External authentication/model/collector unavailable | Stop dependent testing and repair the selected service/account. A failed model invocation is a failed test, not containment success. |
| Unexpected client upgrade | Stop rollout, compare version with declared range and repeat settings, hook, telemetry and OS acceptance. |

For archive recovery, use the source transcript from the affected session, verify its matter identity with the operator's records and preserve the original. Do not paste transcript contents into issues or logs. Record source/copy SHA-256 in approved storage; no database restore command exists.

## State/archive compatibility

State binds a hashed session identity to a canonical matter directory. Malformed bindings are rejected rather than migrated by inference. Existing valid bindings are revalidated on reuse.

Central archive layout is now <record-root>/<full SHA-256 of matter identity>/<matter-name>/. Legacy <record-root>/<matter-name>/ archives are ambiguous when roots contain the same matter name. Keep them intact; an authorised records owner must map each old record to its matter using trusted records and copy it to the proper destination, verify hashes, then update external ingestion. Do not delete originals as part of an upgrade.

## Rollback

Stop new sessions, retain current state/transcripts and replace the installed settings, hook, skill, sandbox policy and manifest with a previously accepted bundle. Verify hashes/signature, run claude doctor, open a fresh synthetic session and verify same-matter access, sibling refusal and SessionEnd copying. Do not resume client work until those checks pass. Never roll back records by deleting newer archives.

## Acceptance records

Record commit, actual client version, observed settings sources, check outcomes and a controlled evidence reference in [operational evidence](operational-evidence-register.md). Keep confidential observations outside this public repository. OS-level isolation, supplier terms and owner approvals cannot be inferred from a green local test.
