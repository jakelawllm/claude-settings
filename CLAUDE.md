# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Claude Code configuration baseline for Australian legal practice: managed settings, a matter-separation hook, a conduct skill, and the policy documents the whole thing exists to enforce. It is a **beta reference implementation**, not a production compliance package, and the README says so on its first screen. Keep it saying so.

The repository is private and unreleased. There are no tags and no versions.

## Commands

```bash
node tests/matter-guard.test.js          # the guard, driven directly. Must always pass
python scripts/check-clause-refs.py      # every clause reference resolves to a real clause
python scripts/scan-history.py           # full git history: credentials and identifying detail
pip install -r requirements.txt          # python-docx, pinned, for the converter

# Regenerate a policy Markdown after editing its .docx. CI fails on drift.
python scripts/docx-to-md.py ai-policy-legal-practice-template.docx ai-policy-legal-practice-template.md
python scripts/docx-to-md.py ai-protocol-barristers-chambers.docx ai-protocol-barristers-chambers.md

CLAUDE_E2E=1 node tests/e2e.test.js      # opt-in: real `claude -p` sessions. Not in CI
```

There is no build step and no linter. `tests/matter-guard.test.js` takes no arguments and needs no environment variable; if it ever does, the documentation is wrong. To run one case, comment out the others — the suite is a flat script, not a framework.

CI runs the first three plus JSON validation and Markdown parity, on `ubuntu-latest`, `macos-latest` and `windows-latest`.

## Architecture

Three layers, and the distinction between them is the point.

**`managed-settings.json`** decides what the tool may do: permission deny rules, MCP allowlist, sandbox, telemetry, and the `claudeMd` standing instruction injected into every session. `settings.json` is the user-scope subset; `matter-settings.json` is a per-matter project file. Deployed to the OS managed-policy directory, which also holds `skills/` and `hooks/`.

**`hooks/matter-guard.js`** binds a session to the first matter it touches and refuses paths under any other, and files the session transcript to the matter folder at `SessionEnd`. It is the only thing here enforcing something no settings key can express.

**`skills/ai-policy-compliance/SKILL.md`** decides what may be *produced* and what must be said about it: refuses to draft evidence, requires a verification worklist, and never claims a citation has been checked.

**The policy documents are the authority.** The `.docx` files are authoritative and the `.md` files are generated from them by `scripts/docx-to-md.py` — never edit a `.md` by hand. Where the configuration and the policy disagree, the configuration is ordinarily what needs correcting. The README records the one deliberate exception (clause 7.3, expert reports).

`ai-protocol-barristers-chambers` is a separate instrument with its own clause numbering. Nothing in the configuration is wired to it, and the skill says so.

## Invariants that are easy to break

**Clause references are load-bearing.** The README, the skill and the policy all cite clause numbers. Inserting a clause renumbers everything after it, and a stale reference still *resolves* — to a real clause about a different subject, which is worse than a broken link. `check-clause-refs.py` exists for this and runs in CI.

**Every defect found in the guard so far has failed in the direction that looks like "allowed".** A lost `deny`, an unreadable config, an unresolved path, an exception: all of them previously permitted the operation. The hook now fails closed in `enforce` mode on every failure it can detect, and writes decisions synchronously to fd 1 because an async write lost at exit is a silent allow. When changing it, assume a mistake will fail open and test for that specifically.

**Tests 30 and 31 assert what the guard does *not* do** — Bash across matters is allowed, unknown tools are not covered. They pin the documented limitations so the README cannot drift away from the behaviour. If they start failing, the boundary moved and the documentation is now wrong in the dangerous direction. Do not "fix" them.

**The guard covers a fixed tool list.** Bash is bound by working directory only; the command string is not parsed. The OS sandbox is what contains Bash, and it does not exist on native Windows, where the boundary is advisory. Do not describe the guard as preventing cross-matter access without that qualification.

**Nothing identifying may enter the repository or its history.** No firm name outside `LICENSE`, no client paths, no internal hostnames or IPs. `scan-history.py` checks the whole history, because a value committed once and removed later is still there.

**Placeholders are deliberate.** `REPLACE-WITH-...` values must stay unreplaced. `CLAUDE_MATTER_ROOTS` shipping as a placeholder is why the guard rejects placeholder roots outright: a non-empty placeholder once passed the "no roots configured" check, matched nothing, and silently disabled enforcement.

**Generated files use LF.** Writing a `.md` with Python's default newline handling on Windows produces CRLF and fails the parity check. Use `newline='\n'`, or regenerate from the `.docx`.

## Working files, not tracked

`research.md`, `policy-review*.md` and `files*.zip` are gitignored. The review files hold outstanding amendments for the policy owner and are the record of what has been raised and not yet applied; read them before concluding something is undone.
