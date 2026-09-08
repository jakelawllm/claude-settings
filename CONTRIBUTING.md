# Contributing

**This repository does not accept external contributions.** It is published for reference and adaptation. Issues are disabled and external pull requests are not monitored. Fork it to adapt it. Report vulnerabilities through [SECURITY.md](SECURITY.md), without client data.

## Maintainer and adaptation workflow

Read [AGENTS.md](AGENTS.md). Follow the virtual-environment setup in [README.md](README.md), install the hashed lock, then run:

```text
python scripts/verify.py
```

Use a dedicated branch, descriptive commits and a pull request. Required checks are matter-guard on Ubuntu, macOS and Windows, settings and policy, and secret scan. Control changes require code-owner review. Do not force-push or merge with failing checks.

## Test selection

Run the affected standalone Node suite during development:

```text
node tests/matter-guard.test.js
node tests/preflight-validate.test.js
node tests/render-production-settings.test.js
```

Set PYTHON to the virtual-environment interpreter for Python-backed suites; the full runner does this automatically. Add meaningful regression tests, especially for denials, invalid configuration, atomic writes, process failures and record recovery. Run the full runner before review.

Live E2E needs a signed-in Claude installation, spends tokens, and sends synthetic canaries only. It tests hook integration, not managed-deployment or OS acceptance. Record failures and skipped cases honestly.

## Policy, schema and dependency changes

Edit the authoritative DOCX, then regenerate its Markdown:

```text
python scripts/docx-to-md.py ai-policy-legal-practice-template.docx ai-policy-legal-practice-template.md
python scripts/docx-to-md.py ai-protocol-barristers-chambers.docx ai-protocol-barristers-chambers.md
python scripts/check-clause-refs.py
```

There is no database or migration framework. For binding/archive format changes, preserve records, document compatibility and migration in [operations](docs/operations.md), and test restart and malformed state. Never silently rewrite a persisted matter identity.

The cached settings schema is a pinned validation input, not proof the deployed client honors every key. Review upstream changes, update its SHA-256 sidecar, execute the suite and repeat client acceptance when updating it.

Dependencies are in requirements.txt and requirements-lock.txt. Retain the explicit Windows-only colorama pin when regenerating the lock with pip-tools. Test the hash-locked install in fresh Python 3.12 environments on Windows and Linux.

## Formatting and sensitive data

Preserve existing formatting, UTF-8 and generated LF line endings. There is no standalone formatter, linter or type checker; git diff --check, syntax, schema and behavioral tests are the quality gates.

Only synthetic names, paths, account UUIDs and endpoints belong in fixtures. Never commit .env, production settings, credentials, transcripts or identifying evidence. Run history and Office XML scanners; logs must report safe labels/locations without matched content.

Local agent runtimes such as `.claude-orch/` contain credentials, session history and downloaded plugins; keep them ignored and never force-add them. The Markdown link check covers tracked files and new nonignored documents. It includes tracked `.claude/` documentation while Git prunes ignored local caches and worktrees.
