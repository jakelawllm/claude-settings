"""Scan the full git history for credentials and identifying detail.

    python scripts/scan-history.py

A coarse net, deliberately dependency-free so it runs anywhere without a
licence or a third-party action. It complements GitHub's own secret scanning
and push protection, which should be enabled before the repository is made
public; it does not replace them.

It also looks for identifying detail, because this repository is a template
published by a law practice: a firm name or an internal host committed once and
removed later still sits in the history, readable by anyone.

Exits non-zero on a hit.
"""

import re
import subprocess
import sys

SECRETS = [
    ("Anthropic key", r"sk-ant-[A-Za-z0-9_\-]{16,}"),
    ("GitHub token", r"gh[pousr]_[A-Za-z0-9]{20,}"),
    ("GitHub PAT", r"github_pat_[A-Za-z0-9_]{20,}"),
    ("AWS access key", r"AKIA[0-9A-Z]{16}"),
    ("Private key block", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("Slack token", r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    ("Generic assignment", r"(?i)\b(api[_-]?key|secret|passwd|password)\b\s*[:=]\s*['\"][^'\"]{8,}"),
]

# Identifying detail that must not reach a public history. Extend per practice.
IDENTIFYING = [
    ("Private IPv4", r"\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
    ("Tailscale host", r"\b[a-z0-9-]+\.ts\.net\b"),
    ("UNC path", r"\\\\\\\\[A-Za-z0-9._-]+\\\\[A-Za-z0-9._$-]+"),
]

ALLOW = [
    re.compile(r"scripts/scan-history\.py"),  # this file states the patterns
    re.compile(r"example\.invalid"),
    re.compile(r"nas\.example"),
]


def main() -> int:
    try:
        diff = subprocess.run(
            ["git", "log", "-p", "--all", "--no-color"],
            capture_output=True, text=True, errors="replace", check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"could not read git history: {exc}")
        return 1

    current = ""
    hits = []
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            current = line[6:]
            continue
        if not line.startswith("+"):
            continue
        if any(a.search(current) or a.search(line) for a in ALLOW):
            continue
        for label, pattern in SECRETS + IDENTIFYING:
            if re.search(pattern, line):
                hits.append((label, current, line.strip()[:110]))

    if hits:
        print(f"{len(hits)} potential disclosure(s) in history:")
        for label, path, text in hits[:40]:
            print(f"  [{label}] {path}: {text}")
        print("\nA hit that is a false positive belongs in ALLOW with a reason.")
        print("A hit that is real cannot be fixed by deleting the file: the")
        print("history must be rewritten before the repository is made public.")
        return 1

    print("No credential or identifying detail found in the full history.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
