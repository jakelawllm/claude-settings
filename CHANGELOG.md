# Changelog

This project has no tagged releases. It is a beta reference implementation and `main` is the only supported revision. Dates are the date of the change.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely. Versions will begin at `v0.1.0-beta.1` when the release gate in the release-readiness review is met.

## Unreleased

### Security

- The matter guard now fails closed in enforce mode on every failure it can detect: unreadable input, unusable configuration, unreadable or corrupt state, a state directory that cannot be created privately, and unexpected exceptions. Previously each of these allowed the operation.
- The shipped `CLAUDE_MATTER_ROOTS` placeholder no longer silently disables enforcement. A placeholder, a relative path, or a set of roots none of which resolve is now a refusal rather than a boundary that matches nothing.
- Paths are resolved to their real location before comparison, so a symlink or junction inside one matter that points into another is refused.
- The POSIX root is preserved in path canonicalisation. It was previously stripped, which made an absolute matter path relative and filed session records to the wrong location.
- Case folding is applied only on Windows. On a case-sensitive filesystem `Smith` and `smith` are now distinct matters.
- Session state is written atomically to a private directory, `0700` with `0600` files, and validated against a schema before use.
- Session records are copied to a temporary name and renamed, so an interrupted copy cannot leave a partial file that looks like a complete record.
- The sandbox is enabled in managed settings with `failIfUnavailable` and `allowUnsandboxedCommands: false`. Native Windows has no sandbox, so Claude Code will refuse to start there rather than run without the boundary.
- `allowedMcpServers` ships empty. A `serverName` entry matches a display name, which does not identify a server.
- `requiredMinimumVersion` raised to `2.1.219`.
- All GitHub Actions are pinned to full commit SHAs.

### Added

- `.github/workflows/ci.yml`: hook tests on Windows, macOS and Linux; JSON validation; policy Markdown parity against the DOCX; clause reference resolution; full-history secret scan.
- `scripts/check-clause-refs.py`, `requirements.txt`, `SECURITY.md`, `CONTRIBUTING.md`, this changelog.
- `skills/ai-policy-compliance/`: the conduct layer, governing what may be produced rather than what the tool may do.

### Changed

- The README no longer claims that no session touches two matters. The guard covers a fixed list of file tools and does not parse Bash; the qualification now appears on the first screen rather than in a limitations section.
