"""Scan the full git history for credentials and identifying detail.

    python scripts/scan-history.py

A coarse net, deliberately dependency-free so it runs anywhere without a
licence or a third-party action. It complements GitHub's own secret scanning
and push protection, which should be enabled before the repository is made
public; it does not replace them.

It also looks for identifying detail, because this repository is a template
published by a law practice: a firm name or an internal host committed once and
removed later still sits in the history, readable by anyone.

It scans three things: added lines across the full diff history, commit
messages (subject + body), and high-entropy runs that look like an unlabelled
secret even when they match no known credential shape.

Findings are never printed with the matched text itself -- only the label and
location -- so running this scanner cannot itself leak the thing it found.

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
    ("Private IPv4 (192.168.x.x)", r"\b192\.168\.\d{1,3}\.\d{1,3}\b"),
    ("Private IPv4 (172.16-31.x.x)", r"\b172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}\b"),
    ("Private IPv4 (10.x.x.x)", r"\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
    ("Tailscale host", r"\b[a-z0-9-]+\.ts\.net\b"),
    ("UNC path", r"\\\\[a-zA-Z0-9_.-]+\\[a-zA-Z0-9_.$-]+"),
]

# Not a known credential shape, but a long run of base64-alphabet characters
# with no whitespace is exactly what an unlabelled token or key looks like.
ENTROPY = [
    ("high-entropy value", r"[A-Za-z0-9+/=]{40,}"),
]

ALL_PATTERNS = SECRETS + IDENTIFYING + ENTROPY

ALLOW = [
    re.compile(r"scripts/scan-history\.py"),  # this file states the patterns
    re.compile(r"example\.invalid"),
    re.compile(r"nas\.example"),
]

_HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def iter_added_lines(diff_text):
    """Yield (filename, lineno, content) for each added line in a unified diff.

    `lineno` is the line's position in the new (post-change) file, tracked via
    the hunk headers, so a finding can be reported as file:line rather than
    just file.
    """
    filename = ""
    lineno = 0
    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            filename = line[6:]
            lineno = 0
            continue
        m = _HUNK_HEADER.match(line)
        if m:
            lineno = int(m.group(1)) - 1
            continue
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            lineno += 1
            yield filename, lineno, line[1:]
        elif line.startswith(" "):
            lineno += 1
        # lines starting with "-" are removed and don't exist in the new
        # file, so they don't advance the new-file line number.


def scan_diff():
    try:
        diff = subprocess.run(
            ["git", "log", "-p", "--all", "--no-color"],
            capture_output=True, text=True, errors="replace", check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"could not read git history: {exc}")
        return None

    hits = []
    for filename, lineno, content in iter_added_lines(diff):
        location = f"{filename}:{lineno}"
        if any(a.search(filename) or a.search(content) for a in ALLOW):
            continue
        for label, pattern in ALL_PATTERNS:
            if re.search(pattern, content):
                hits.append((label, location))
    return hits


def scan_commit_messages():
    """Scan commit subjects and bodies, not just diff content.

    Uses unit-separator (\\x1f) and record-separator (\\x1e) delimiters so a
    multi-line body can't be confused with the next commit's hash, and so the
    hash itself (40 hex chars, which would otherwise trip the entropy check)
    is never part of the scanned text.
    """
    try:
        log = subprocess.run(
            ["git", "log", "--all", "--format=%H%x1f%s%x1f%b%x1e"],
            capture_output=True, text=True, errors="replace", check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"could not read commit messages: {exc}")
        return None

    hits = []
    for record in log.split("\x1e"):
        record = record.strip("\n")
        if not record:
            continue
        parts = record.split("\x1f")
        commit_hash = parts[0].strip()
        message = "\x1f".join(parts[1:]) if len(parts) > 1 else ""
        short = commit_hash[:12] if commit_hash else "unknown"
        location = f"commit {short}"
        for text_line in message.splitlines():
            if any(a.search(text_line) for a in ALLOW):
                continue
            for label, pattern in ALL_PATTERNS:
                if re.search(pattern, text_line):
                    hits.append((label, location))
    return hits


def main() -> int:
    diff_hits = scan_diff()
    if diff_hits is None:
        return 1

    message_hits = scan_commit_messages()
    if message_hits is None:
        return 1

    hits = diff_hits + message_hits

    if hits:
        print(f"{len(hits)} potential disclosure(s) in history:")
        for label, location in hits[:40]:
            print(f"FOUND: {location}: {label} [REDACTED]")
        print("\nA hit that is a false positive belongs in ALLOW with a reason.")
        print("A hit that is real cannot be fixed by deleting the file: the")
        print("history must be rewritten before the repository is made public.")
        return 1

    print("No credential or identifying detail found in the full history.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
