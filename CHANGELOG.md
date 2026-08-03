# Changelog

This project has no tagged releases. It is a beta reference implementation and `main` is the only supported revision. Dates are the date of the change.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely. Versions will begin at `v0.1.0-beta.1` when the release gate in the release-readiness review is met.

## Unreleased

### Production readiness remediation (Gates 0–5)

- `scripts/preflight-validate.py` now supports two modes: `--mode template` (placeholders are expected and reported as warnings) and `--mode production` (placeholders and observation-mode defaults are blockers). This resolves the central ambiguity in the production audit: the checked-in template is valid as a template, and wrong as a production deployment.
- `scripts/render-production-settings.py` gives operators a safe, repeatable way to produce a production settings file without committing firm-identifying values. Inputs come from CLI flags or environment variables; output defaults to the gitignored `dist/managed-settings.production.json`; the script refuses to write output containing `REPLACE-WITH`.
- `tests/preflight-validate.test.js` and `tests/render-production-settings.test.js` lock the expected behaviour for template vs production validation and the renderer.
- `.github/workflows/ci.yml` now runs the preflight and renderer test suites, preserving the existing guard tests, JSON validation, policy parity check, clause reference resolution, and history scan.
- `docs/release-checklist.md` records the engineering evidence that must exist before a practice can make its own go/no-go decision, including automated and manual gates, artefact list, rollback procedure, and the do-not-tag-until checklist.
- `README.md` and `SECURITY.md` now document the production-rendered settings workflow and the distinction between template and production preflight modes.
- `.gitignore` now explicitly ignores the `dist/` directory used for rendered production settings.
- Policy Markdown files regenerated from authoritative DOCX sources; clause references and parity remain clean.

### Security

- The matter guard now fails closed in enforce mode on every failure it can detect: unreadable input, unusable configuration, unreadable or corrupt state, a state directory that cannot be created privately, and unexpected exceptions. Previously each of these allowed the operation.
- The shipped `CLAUDE_MATTER_ROOTS` placeholder no longer silently disables enforcement. A placeholder, a relative path, or a set of roots none of which resolve is now a refusal rather than a boundary that matches nothing.
- Paths are resolved to their real location before comparison, so a symlink or junction inside one matter that points into another is refused.
- The POSIX root is preserved in path canonicalisation. It was previously stripped, which made an absolute matter path relative and filed session records to the wrong location.
- Case folding is applied only on Windows. On a case-sensitive filesystem `Smith` and `smith` are now distinct matters.
- Session state is written atomically to a private directory, `0700` with `0600` files, and validated against a schema before use.
- Session records are copied to a temporary name and renamed, so an interrupted copy cannot leave a partial file that looks like a complete record.
- The sandbox is enabled in managed settings with `failIfUnavailable` and `allowUnsandboxedCommands: false`. Native Windows has no sandbox, so the guard runs there in an advisory capacity only: Bash is not contained by the OS boundary, and that qualification must be stated wherever the guard's coverage is described.
- `allowedMcpServers` ships empty. A `serverName` entry matches a display name, which does not identify a server.
- `requiredMinimumVersion` raised to `2.1.219`.
- Matters roots are resolved to their real paths. They were canonicalised lexically while targets were resolved, so on macOS, where `/var` is a symlink to `/private/var`, a root under it matched nothing: no path looked like client material and every cross-matter access was permitted. Found by cross-platform CI on its first run.
- All GitHub Actions are pinned to full commit SHAs.

### Policy documents

- Added `ai-protocol-barristers-chambers.docx` and its Markdown rendering: the equivalent instrument for a barrister and for chambers, covering releasing work under your own name, readers and devils, chambers arrangements, fees and copyright. Its clause numbering is its own and nothing in this repository is wired to it.
- The practice policy is replaced with a revision that restores the template placeholders, states clause 8.3 as three matters rather than four, quotes rule 9.1 of the conduct rules more precisely, and genericises Schedule 8 Part E so a practice on another tier or provider does not inherit conclusions that are wrong for it.
- Clause 8.8 now records that the construction it rests on "follows from the text of the instrument but has not been the subject of decision". That is the release review's H-05 finding, and the wording in the incoming revision is better than the one previously applied here, so the earlier version was dropped rather than duplicated.
- References to "the four satisfactions" in the README and the skill are corrected: clause 8.3 now states three.

### Policy template

- Clause 8.8 now states that "a retention period is neither publication nor training" is a conclusion the practice has reached on the wording of the instruments, not a supplier fact, and requires approval by the principal with a date. It is the reasoning that permits restricted information on a tier without zero data retention, so an adopting practice must reach its own view rather than inherit this one.
- Schedule 8 distinguishes three kinds of statement that were previously read alike: a supplier fact traceable to the evidence file, a deployment fact an adopting practice must replace, and a conclusion carrying its approval date.
- Schedule 8 Part E is marked as a worked example of one practice's arrangements. It stated a Team tier as though it were the template's position, and a practice on Enterprise, Bedrock, Google Cloud or Microsoft-hosted models would have inherited conclusions that are wrong for it.
- Schedule 5 gains a source and date-last-checked column. A row without a date is to be treated as unverified.

### Testing

- `tests/e2e.test.js`: an opt-in tier that drives the guard through real `claude -p` sessions against a temporary two-matter tree, asserting that a token from the other matter never reaches the answer. Four cases pass. It does not run in CI, which has no credentials.
- Two unit cases now pin the documented limitations: a Bash command reaching another matter is allowed, and an unrecognised tool is not covered. They fail if the boundary ever moves, so the documentation cannot drift away from the behaviour.
- The live run established that the Bash route is refused by the model complying with its instructions rather than by the guard. That is instruction-following, not enforcement, and does not hold against an injected instruction.

### Added

- `.github/workflows/ci.yml`: hook tests on Windows, macOS and Linux; JSON validation; policy Markdown parity against the DOCX; clause reference resolution; full-history secret scan.
- `scripts/check-clause-refs.py`, `requirements.txt`, `SECURITY.md`, `CONTRIBUTING.md`, this changelog.
- `skills/ai-policy-compliance/`: the conduct layer, governing what may be produced rather than what the tool may do.

### Changed

- The README no longer claims that no session touches two matters. The guard covers a fixed list of file tools and does not parse Bash; the qualification now appears on the first screen rather than in a limitations section.
