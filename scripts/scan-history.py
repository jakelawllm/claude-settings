"""Scan the full git history for credentials and identifying detail.

    python scripts/scan-history.py

A coarse net, deliberately dependency-free so it runs anywhere without a
licence or a third-party action. It complements GitHub's own secret scanning
and push protection, which should be enabled before the repository is made
public; it does not replace them. Two residuals of the Dependabot URL
allowance, both scoped to entropy findings in commit messages:

1. A bare 40-hex secret placed in the SHA slot of a genuine github.com
   compare/commit URL is allowed by design (that is the shape the allowance
   exists to pass).
2. A high-entropy value that contains ``/`` and is split across the owner
   and repo slots so that no single segment reaches 40 characters is not
   caught by the per-segment residue check. Each segment looks ordinary.

Credential-shaped patterns (API keys, tokens, private IPs, hostnames) are
never suppressed by a URL: the allowance is gated to the entropy label.
Platform secret scanning and push protection remain the control for the
hex-shaped and split-segment cases above.

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
ENTROPY_LABEL = "high-entropy value"
ENTROPY_PATTERN = r"[A-Za-z0-9+/=]{40,}"
ENTROPY = [
    (ENTROPY_LABEL, ENTROPY_PATTERN),
]

ALL_PATTERNS = SECRETS + IDENTIFYING + ENTROPY

PATH_ALLOW = [
    re.compile(r"^scripts/scan-history\.py$"),  # this file states the patterns
    # Test fixtures deliberately state scanner patterns and exercise them;
    # the scanner must not flag its own negative-test corpus.
    re.compile(r"^tests/scan-docx-xml\.test\.js$"),
    re.compile(r"^tests/scan-history\.test\.js$"),
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
# git commit SHAs the platform inserted, not credentials.
MERGE_COMMIT_LINE = re.compile(r"^Merge [0-9a-f]{40} into [0-9a-f]{40}$")
# Dependabot and GitHub UI commit bodies cite compare/commit URLs that embed
# full 40-hex SHAs. The entropy class includes '/', so a match may be the bare
# SHA or a longer URL-path+SHA run. Start-of-line, whitespace and opening prose
# delimiters are accepted because Dependabot emits Markdown links such as
# ``[Commits](https://github.com/...)``. A separate preceding-context check
# rejects candidates when another ``://`` already appears earlier on the line,
# which prevents a github.com URL nested inside a foreign URL's query/fragment
# from qualifying. A residual remains for a genuine github.com SHA slot
# (documented above).
_GITHUB_URL_START = r"(?:(?<=^)|(?<=[\s({'\"[<,;]))(?:https?://)?github\.com/"
GITHUB_COMPARE_URL = re.compile(
    _GITHUB_URL_START + r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
    r"/compare/([0-9a-f]{40})\.\.\.([0-9a-f]{40})(?=$|[\s),.;:\]?#])"
)
GITHUB_COMMIT_URL = re.compile(
    _GITHUB_URL_START + r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
    r"/commit/([0-9a-f]{40})(?=$|[\s),.;:\]?#])"
)
_HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d)? \+(\d+)(?:,\d+)? @@")


def path_is_allowed(filename):
    """Return true for files whose own source necessarily states scanner patterns."""
    return any(a.search(filename) for a in PATH_ALLOW)


def _match_covers_sha(match, url_match):
    """Return true when a captured SHA lies wholly inside the match span.

    The entropy class includes '/', so a real Dependabot URL produces an
    entropy match like ``world/commit/<sha>`` that is longer than the bare
    SHA. We therefore ask the reverse of containment: does one of the URL's
    captured SHA groups sit inside the match? If so, the match is the SHA
    (possibly with preceding URL path) rather than an unrelated secret that
    merely happens to lie inside the URL's overall character span.
    """
    sha_spans = []
    for g in range(1, (url_match.lastindex or 0) + 1):
        try:
            sha_spans.append(url_match.span(g))
        except IndexError:
            pass
    return any(
        s[0] >= match.start() and s[1] <= match.end() and (s[1] - s[0]) == 40
        for s in sha_spans
    )


def _url_has_prior_scheme(content, url_match):
    """Return true when another ``://`` already appears before this URL match.

    Nested foreign forms such as ``https://evil.example/?next=(github.com/...)``
    or ``https://evil.example/?next=x;github.com/...`` pass the left-boundary
    class because of the opening delimiter or whitespace after the foreign
    scheme. Rejecting any candidate with a prior ``://`` on the same line keeps
    those nested forms closed while still accepting Dependabot Markdown links
    like ``[Commits](https://github.com/...)``, which have no prior scheme.
    """
    return "://" in content[: url_match.start()]


def _residue_has_entropy(match, url_match):
    """Return true if a single path segment still has a 40+ run after SHA masking.

    A genuine Dependabot URL contributes only the SHA's entropy. Once that SHA
    is masked out, any remaining unlabelled token in the owner or repo *slot*
    must remain a finding. Residue is checked per path segment (split on '/'),
    not as a slash-joined string: the entropy class includes '/', so a long but
    ordinary ``owner/repo/commit`` path would otherwise trip the residue check
    even when no single segment is high-entropy.
    """
    masked = match.group(0)
    # Mask from the rightmost SHA first so earlier offsets stay valid.
    for g in range((url_match.lastindex or 0), 0, -1):
        try:
            rel_start = url_match.start(g) - match.start()
            rel_end = url_match.end(g) - match.start()
        except IndexError:
            continue
        if rel_start < 0 or rel_end > len(masked):
            continue
        masked = masked[:rel_start] + masked[rel_end:]
    return any(re.fullmatch(ENTROPY_PATTERN, segment) for segment in masked.split("/"))


def match_is_allowed(filename, content, match, source="diff", label=""):
    """Return true only for a matched value that is a known non-secret.

    Do not allowlist a whole line because it contains a harmless example. A
    real credential can sit beside an allowed value on the same line. Contextual
    allowances below prove the matched high-entropy value is an integrity digest
    or documented placeholder, not just that the surrounding line looked safe.

    source: "diff" for diff content, "commit_message" for commit subjects/bodies.
    The Dependabot URL allowance is scoped to commit messages only.
    """
    match_text = match.group(0)
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
    # Dependabot-style commit-body URLs. Only an entropy (SHA-shaped) finding is
    # eligible: a credential or identifying-detail pattern is never suppressed by
    # proximity to a URL. The match must cover one of the URL's captured SHAs,
    # and masking that SHA must leave no second 40+ run behind (which would mean
    # an unlabelled token in the owner/repo slot). Diff content is not covered:
    # a checked-in file that only looks like a compare URL is still scanned.
    if source == "commit_message" and label == ENTROPY_LABEL:
        for url_match in GITHUB_COMPARE_URL.finditer(content):
            if (
                not _url_has_prior_scheme(content, url_match)
                and _match_covers_sha(match, url_match)
                and not _residue_has_entropy(match, url_match)
            ):
                return True
        for url_match in GITHUB_COMMIT_URL.finditer(content):
            if (
                not _url_has_prior_scheme(content, url_match)
                and _match_covers_sha(match, url_match)
                and not _residue_has_entropy(match, url_match)
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
                if match_is_allowed(filename, content, match, source="diff", label=label):
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
        message = "\n".join(parts[1:]) if len(parts) > 1 else ""
        short = commit_hash[:12] if commit_hash else "unknown"
        location = f"commit {short}"
        for text_line in message.splitlines():
            for label, pattern in ALL_PATTERNS:
                for match in re.finditer(pattern, text_line):
                    if match_is_allowed(
                        "", text_line, match, source="commit_message", label=label
                    ):
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
