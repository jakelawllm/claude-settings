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

PATH_ALLOW = [
    re.compile(r"^scripts/scan-history\.py$"),  # this file states the patterns
    # Test fixtures deliberately state scanner patterns and exercise them;
    # the scanner must not flag its own negative-test corpus.
    re.compile(r"^tests/scan-docx-xml\.test\.js$"),
]

ALLOW_MATCH = [
    re.compile(r"example\.invalid"),
    re.compile(r"nas\.example"),
    # Sandbox schema field lists contain long slash-separated identifier runs;
    # they are documented field names, not unlabelled credentials.
    re.compile(r"filesystem\.denyRead/allowRead/allowWrite/allowManagedReadPathsOnly"),
    re.compile(r"network\.allowedDomains/allowManagedDomainsOnly/allowLocalBinding"),
    # The entropy regex matches prefix-less runs because dots break the class;
    # these bare runs appear in generate-matter-sandbox.py docstrings.
    re.compile(r"^denyRead/allowRead/allowWrite/allowManagedReadPathsOnly$"),
    re.compile(r"^allowedDomains/allowManagedDomainsOnly/allowLocalBinding$"),
]

HEX64 = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
RECORDS_HASH_PLACEHOLDER = re.compile(
    r"^aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899$"
)
# GitHub auto-generates this exact commit-message line for the synthetic
# refs/pull/N/merge ref used by pull_request-triggered CI. Both hex runs are
# git commit SHAs the platform inserted, not credentials -- and this is the
# only context in which we accept a bare 40-hex run in a commit message.
MERGE_COMMIT_LINE = re.compile(r"^Merge [0-9a-f]{40} into [0-9a-f]{40}$")
_HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d)? \+(\d+)(?:,\d+)? @@")


def path_is_allowed(filename):
    """Return true for files whose own source necessarily states scanner patterns."""
    return any(a.search(filename) for a in PATH_ALLOW)


def match_is_allowed(filename, content, match_text):
    """Return true only for a matched value that is a known non-secret.

    Do not allowlist a whole line because it contains a harmless example. A
    real credential can sit beside an allowed value on the same line. Contextual
    allowances below prove the matched high-entropy value is an integrity digest
    or documented placeholder, not just that the surrounding line looked safe.
    """
    if any(a.search(match_text) for a in ALLOW_MATCH):
        return True
    # GitHub's synthetic pull_request merge commit messages contain two bare
    # 40-hex SHAs. Accept only when the whole line is that exact platform form
    # and the matched text is one of those SHAs -- not any other long hex run
    # that happens to appear near a "Merge" word.
    if SHA40.fullmatch(match_text) and MERGE_COMMIT_LINE.fullmatch(content.strip()):
        return True
    if SHA40.fullmatch(match_text) and re.search(
        r"uses:\s+\S+@" + re.escape(match_text) + r"\b", content
    ):
        return True
    if HEX64.fullmatch(match_text):
        if re.search(r"--hash=sha256:" + re.escape(match_text) + r"\b", content):
            return True
        if RECORDS_HASH_PLACEHOLDER.fullmatch(match_text):
            return True
        if (
            filename == "schemas/claude-code-settings.schema.json.sha256"
            and content.strip().startswith(match_text)
        ):
            return True
    return False


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
        if path_is_allowed(filename):
            continue
        for label, pattern in ALL_PATTERNS:
            for match in re.finditer(pattern, content):
                if match_is_allowed(filename, content, match.group(0)):
                    continue
                hits.append((label, location))
    return hits


def scan_commit_messages():
    """Scan commit subjects and bodies, not just diff content.

    Uses unit-separator (\x1f) and record-separator (\x1e) delimiters so a
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
            for label, pattern in ALL_PATTERNS:
                for match in re.finditer(pattern, text_line):
                    if match_is_allowed("", text_line, match.group(0)):
                        continue
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
        print("\nA hit that is a false positive belongs in ALLOW_MATCH with a reason.")
        print("A hit that is real cannot be fixed by deleting the file: the")
        print("history must be rewritten before the repository is made public.")
        return 1

    print("No credential or identifying detail found in the full history.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
