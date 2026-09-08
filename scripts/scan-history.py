"""Scan the full git history for credentials and identifying detail.

    python scripts/scan-history.py
    python scripts/scan-history.py --worktree

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

With --worktree, it also scans staged and unstaged changes independently and
Git-listed nonignored untracked text files, without following symlinks. Ignored
runtime files are never enumerated; this is not a scan of the whole filesystem.

It scans added lines across full diff history, commit messages, historical
filenames, ref names and annotated tag messages. Its long-character-run rule
is a heuristic, not a mathematical entropy calculation. Office payloads are
covered separately by scan-docx-xml.py --history. Arbitrary binary formats and
obfuscated credentials require a maintained scanner/platform push protection.

Findings are never printed with the matched text itself -- only the label and
location -- so running this scanner cannot itself leak the thing it found.

Exits non-zero on a hit.
"""

import argparse
import os
from pathlib import Path
import re
import stat
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
    ("UNC path", r"\\\\[a-zA-Z0-9_.-]+\\[a-zA-Z0-9_.$-]+(?:\\[^\s]*)?"),
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
    # Test fixtures deliberately state scanner patterns and exercise them;
    # the scanner must not flag its own negative-test corpus.
    re.compile(r"^tests/scan-docx-xml\.test\.js$"),
    re.compile(r"^tests/scan-history\.test\.js$"),
]

ALLOW_MATCH = [
    re.compile(r"^\\\\nas\.example\\[A-Za-z0-9_.$-]+(?:\\[^\s]*)?$"),
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
# Reviewed public commits of this repository, cited by the dated readiness
# evidence. The exception is limited to these values and document paths; it
# never suppresses another value or a credential-shaped match on the same line.
_REVIEW_BASELINE = "e25608d975ef58d31bd4" "ff7984eabb0622046b22"
_HISTORICAL_ASSESSMENT = "29e76ac949c47104185a" "ee0ffa16569ea6a6c862"
# Clean tracked source of the completed managed synthetic acceptance run;
# verified as this repository's commit object and ancestor of the review head.
_MANAGED_TEST_SOURCE = "9a0372a123d1f038378b" "b6360806c139cfed2f61"
REVIEWED_COMMIT_REFS = {
    "docs/INTERNAL_MVP_READINESS_REPORT.md": {_REVIEW_BASELINE, _HISTORICAL_ASSESSMENT, _MANAGED_TEST_SOURCE},
    "docs/INTERNAL_MVP_REMAINING_ISSUES.md": {_MANAGED_TEST_SOURCE},
    "docs/release-checklist.md": {_REVIEW_BASELINE},
}
# Public integrity digest verified against .github/workflows/claude.yml in
# 864fd0c after CRLF-to-LF normalization. Keep this exact value and evidence
# path scoped; changed workflow hashes require a new review, not a blanket
# allowance for hex values in policy evidence.
_DISABLED_WORKFLOW_DIGEST = (
    "649d3a459ff0e903e237d9a8924927344" "be095d58ac2681cce914149ee0aeb90"
)
# Operator-signed synthetic launch manifest; SHA-256 rechecked against the
# retained launcher/manifest.json, not a signature or a private key.
_MVP_SIGNED_MANIFEST = (
    "b501ba838a7a48c4e93e5e103b8baf8f" "7a462bb97a51c40995764d4b61d4d462"
)
# Pinned derived runtime image identity, rechecked using Docker image inspect.
_MVP_RUNTIME_IMAGE = (
    "80afdbd51b7e3d3e6fe04c2e52f8dcfd" "3cd1e75182e7bddb9f637d8d20be0cef"
)
# SHA-256 of the retained claude-apply-proc-compatible.apparmor source.
_MVP_APPARMOR_PROFILE = (
    "0630118144fe3f4304e552df6151bdc0" "70e1507e60b1f80ef3baea3e7563b85a"
)
# SHA-256 of the retained claude-runtime-step7.draft.json source.
_MVP_SECCOMP_PROFILE = (
    "8b94fcccdb599de24c74a4730e387b26" "e41f37eab39b73f124278f25b6ae20f8"
)
# SHA-256 of the 24-byte synthetic persistence marker, read again after restart.
_MVP_RESTART_MARKER = (
    "15e586954d3c598fefb83c0177aaedd3" "604f81371efff29f66ff854a73ec4935"
)
# SHA-256 of the exact normal-v5 synthetic SessionEnd archive, rechecked
# against the protected source selected by its hashed session identity.
_MVP_SYNTHETIC_ARCHIVE = (
    "744219f4a1ed280be44327f819185e3f" "d332c34dfef2e207e5a117eca9005503"
)
# SHA-256 of the encrypted synthetic archive backup after its independent
# Windows round trip; this is the ciphertext digest, never the recovery key.
_MVP_ENCRYPTED_BACKUP = (
    "06df115e7d239c729452f777442b7d3e" "201da8149ad875eb233070407ba65094"
)
# SHA-256 of the retained initial acceptance/final-repository-verify.log.
# That historical log is immutable; subsequent verification uses another file.
_MVP_INITIAL_VERIFY_LOG = (
    "7a6e3c5c65e5a445cfbb8328d3f9510c" "0011fc077ebc9c04520df8207eea74e6"
)
# Exact reviewed values only, scoped to the two documents citing this run.
# No document, arbitrary hex value, neighbouring secret or credential label
# is exempted by these integrity references.
_MVP_ARTIFACT_DIGESTS = {
    _MVP_SIGNED_MANIFEST, _MVP_RUNTIME_IMAGE, _MVP_APPARMOR_PROFILE,
    _MVP_SECCOMP_PROFILE, _MVP_RESTART_MARKER, _MVP_SYNTHETIC_ARCHIVE,
    _MVP_ENCRYPTED_BACKUP,
}
REVIEWED_ARTIFACT_DIGESTS = {
    "docs/policy-decisions/oauth-token-management.md": {_DISABLED_WORKFLOW_DIGEST},
    "docs/INTERNAL_MVP_READINESS_REPORT.md": _MVP_ARTIFACT_DIGESTS | {_MVP_INITIAL_VERIFY_LOG},
    "docs/synthetic-container-checks.md": _MVP_ARTIFACT_DIGESTS,
}
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
_HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def safe_location(value):
    """Never echo a credential embedded in an attacker-controlled filename."""
    for _, pattern in ALL_PATTERNS:
        value = re.sub(pattern, "[REDACTED]", value)
    return re.sub(r"[\x00-\x1f\x7f]", "?", value)


def path_is_allowed(filename):
    """Return true for the explicitly synthetic negative-test corpora."""
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
    if source == "diff" and label == ENTROPY_LABEL and match_text in REVIEWED_COMMIT_REFS.get(filename, set()):
        return True
    if source == "diff" and label == ENTROPY_LABEL and match_text in REVIEWED_ARTIFACT_DIGESTS.get(filename, set()):
        return True
    if any(a.fullmatch(match_text) for a in ALLOW_MATCH):
        return True
    # These scanner regex source literals describe the synthetic NAS example;
    # do not exempt any other text on those lines or elsewhere in the files.
    if filename in {"scripts/scan-history.py", "scripts/scan-docx-xml.py"} and label == "UNC path":
        slash = chr(92)
        base = "^" + slash * 4 + "nas" + slash + ".example" + slash * 2 + "[A-Za-z0-9_.$-]+"
        optional_tail = "(?:" + slash * 2 + "[^" + slash + "s]*)?"
        if content.strip() in {f're.compile(r"{base}$"),', f're.compile(r"{base}{optional_tail}$"),'}:
            return True
    # Scan this scanner too. Only its two literal synthetic UNC comparisons
    # need an exception; future credentials added elsewhere must still fail.
    if filename == "scripts/scan-history.py" and label == "UNC path":
        slash = chr(92)
        example = slash * 2 + "server" + slash + "share"
        if content.strip() in {
            f'and match_text == r"{example}"',
            f'== r"Accepts Windows drive letters (C:{slash}), UNC ({example}), and POSIX (/)."',
        }:
            return True
    # Historical path-parser docstrings use this exact conventional synthetic
    # UNC example. Match the full line: the identifying regex may stop after
    # the share name before an unrecognised path character.
    if (
        label == "UNC path"
        and match_text == r"\\server\share"
        and content.strip()
        == r"Accepts Windows drive letters (C:\), UNC (\\server\share), and POSIX (/)."
    ):
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
    in_hunk = False
    for line in diff_text.splitlines():
        if line.startswith("diff --git "):
            filename = ""
            lineno = 0
            in_hunk = False
            continue
        if line.startswith("+++ b/") and not in_hunk:
            filename = line[6:]
            lineno = 0
            continue
        m = _HUNK_HEADER.match(line)
        if m:
            lineno = int(m.group(1)) - 1
            in_hunk = True
            continue
        if not in_hunk:
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
            ["git", "-c", "core.quotePath=false", "log", "--format=", "-p", "--all", "--full-history", "-m", "--no-color", "--no-ext-diff", "--no-textconv"],
            capture_output=True, text=True, errors="replace", check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"could not read git history: {exc}")
        return None

    hits = []
    for filename, lineno, content in iter_added_lines(diff):
        location = f"{safe_location(filename)}:{lineno}"
        if path_is_allowed(filename):
            continue
        for label, pattern in ALL_PATTERNS:
            for match in re.finditer(pattern, content):
                if match_is_allowed(filename, content, match, source="diff", label=label):
                    continue
                hits.append((label, location))
    return hits



def _candidate_text(root, filename):
    """Read only a Git-listed regular file or symlink target, never its referent.

    On POSIX, directory descriptors prevent parent-symlink replacement from
    redirecting a read outside the checkout. Platforms without dir_fd support
    reject symlink parents and verify the opened file still matches lstat.
    """
    parts = filename.split("/")
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise OSError("invalid Git candidate path")
    descriptors = []
    try:
        if os.open in os.supports_dir_fd and os.stat in os.supports_dir_fd:
            directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            descriptors.append(directory)
            for part in parts[:-1]:
                directory = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                    dir_fd=directory)
                descriptors.append(directory)
            leaf = parts[-1]
            before = os.stat(leaf, dir_fd=directory, follow_symlinks=False)
            if stat.S_ISLNK(before.st_mode):
                return os.fsencode(os.readlink(leaf, dir_fd=directory))
            if not stat.S_ISREG(before.st_mode):
                raise OSError("candidate is not a regular file")
            descriptor = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        else:
            target = Path(root)
            for index, part in enumerate(parts):
                # Git paths are relative even on Windows; refuse drive aliases.
                if os.path.isabs(part) or os.path.splitdrive(part)[0]:
                    raise OSError("invalid Git candidate path")
                target = target / part
                before = target.lstat()
                if getattr(target, "is_junction", lambda: False)():
                    raise OSError("candidate is a junction")
                if index < len(parts) - 1 and not stat.S_ISDIR(before.st_mode):
                    raise OSError("candidate parent is not a directory")
            if stat.S_ISLNK(before.st_mode):
                return os.fsencode(os.readlink(target))
            if not stat.S_ISREG(before.st_mode):
                raise OSError("candidate is not a regular file")
            descriptor = os.open(target, os.O_RDONLY | getattr(os, "O_BINARY", 0))
        with os.fdopen(descriptor, "rb") as handle:
            after = os.fstat(handle.fileno())
            if not stat.S_ISREG(after.st_mode) or (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
                raise OSError("candidate changed while opening")
            return handle.read()
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def _candidate_hits(filename, content, location, *, metadata=False):
    """Reuse exact-token rules while keeping filenames outside fixture exemptions."""
    if not metadata and path_is_allowed(filename):
        return []
    hits = []
    for label, pattern in ALL_PATTERNS:
        for match in re.finditer(pattern, content):
            if not match_is_allowed("" if metadata else filename, content, match,
                                    source="diff", label=label):
                hits.append((label, safe_location(location)))
    return hits


def scan_worktree():
    """Scan proposed content separately from history, including the Git index.

    Combining HEAD with the working tree would miss a staged secret removed
    only from disk. Separate diffs preserve that intermediate staged content.
    Git supplies candidate names; ignored caches are neither walked nor opened.
    """
    try:
        root_output = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                                     capture_output=True, check=True).stdout
        if not root_output.endswith(b"\n"):
            raise ValueError("invalid Git root")
        root = os.fsdecode(root_output[:-1])

        def git_bytes(*args):
            return subprocess.run(["git", "-c", "core.quotePath=false", *args],
                                  cwd=root, capture_output=True, check=True).stdout

        def git_names(*args):
            output = git_bytes(*args)
            if output and not output.endswith(b"\0"):
                raise ValueError("invalid Git filename framing")
            return [os.fsdecode(name) for name in output.split(b"\0") if name]

        if git_bytes("ls-files", "--unmerged", "-z"):
            raise ValueError("unmerged index cannot be scanned completely")
        hits = []
        for source, staged in [("index", ["--cached"]), ("worktree", [])]:
            options = ["diff", *staged, "--no-renames", "--no-relative",
                       "--no-ext-diff", "--no-textconv"]
            for filename in git_names(*options, "--name-only", "-z", "--"):
                hits.extend(_candidate_hits(filename, filename, f"{source} path", metadata=True))
            diff = git_bytes(*options, "--no-color", "--src-prefix=a/", "--dst-prefix=b/", "--").decode("utf-8", errors="replace")
            for filename, lineno, content in iter_added_lines(diff):
                hits.extend(_candidate_hits(filename, content, f"{source} {filename}:{lineno}"))
        for filename in git_names("ls-files", "--others", "--exclude-standard", "-z"):
            hits.extend(_candidate_hits(filename, filename, "untracked path", metadata=True))
            # The two explicit negative-test corpora need no filesystem read.
            if path_is_allowed(filename):
                continue
            payload = _candidate_text(root, filename)
            # Match Git's text scope; Office archives have a dedicated scanner.
            if b"\0" in payload:
                continue
            for lineno, content in enumerate(payload.decode("utf-8", errors="replace").splitlines(), 1):
                hits.extend(_candidate_hits(filename, content, f"untracked {filename}:{lineno}"))
        return hits
    except (OSError, ValueError, subprocess.CalledProcessError):
        # Git stderr and filesystem exceptions can include secrets in paths.
        print("ERROR: could not scan complete index and working tree")
        return None


def scan_commit_messages():
    """Scan commit subjects and bodies, not just diff content.

    NUL framing keeps ordinary message control characters from becoming record
    separators. Reject malformed framing rather than skipping unscanned text.
    """
    try:
        log = subprocess.run(
            ["git", "log", "--all", "--format=%H%x00%B%x00"],
            capture_output=True, text=True, errors="replace", check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"could not read commit messages: {exc}")
        return None

    hits = []
    records = log.split("\0")
    if records[-1].strip() or len(records) % 2 != 1:
        print("could not parse complete commit message history")
        return None
    for index in range(0, len(records) - 1, 2):
        commit_hash = records[index].strip()
        message = records[index + 1]
        if not re.fullmatch(r"[0-9a-f]{40,64}", commit_hash):
            print("could not parse complete commit message history")
            return None
        short = commit_hash[:12]
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


def scan_metadata():
    """Inspect historical paths, ref names and annotated tag messages."""
    try:
        objects = subprocess.run(["git", "rev-list", "--objects", "--all"], capture_output=True,
                                 text=True, encoding="utf-8", errors="replace", check=True).stdout
        refs = subprocess.run(["git", "for-each-ref", "--format=%(objecttype)%00%(objectname)%00%(refname)%00%(contents)%00"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        print("could not read complete repository metadata")
        return None
    values = []
    for line in objects.splitlines():
        oid, _, filename = line.partition(" ")
        if filename:
            values.append((filename, f"object {oid[:12]} path", "diff"))
    records = refs.split("\0")
    if records[-1].strip() or len(records) % 4 != 1:
        print("could not parse complete repository metadata")
        return None
    for index in range(0, len(records) - 1, 4):
        kind, oid, name, content = records[index:index + 4]
        if not re.fullmatch(r"[0-9a-f]{40,64}", oid):
            print("could not parse complete repository metadata")
            return None
        values.append((name, f"object {oid[:12]} ref", "diff"))
        if kind.strip() == "tag":
            values.append((content, f"object {oid[:12]} tag message", "commit_message"))
    hits = []
    for value, location, source in values:
        for line in value.splitlines():
            for label, pattern in ALL_PATTERNS:
                for match in re.finditer(pattern, line):
                    # Ordinary ref prefixes can exceed forty characters across
                    # path separators. Check each ref component for this coarse
                    # heuristic; credential-shaped rules still inspect the whole.
                    if label == ENTROPY_LABEL and location.endswith(" ref") and not any(
                        re.fullmatch(ENTROPY_PATTERN, part) for part in match.group(0).split("/")
                    ):
                        continue
                    if not match_is_allowed("", line, match, source=source, label=label):
                        hits.append((label, location))
    return hits


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--worktree", action="store_true",
                        help="also scan index, unstaged changes and nonignored untracked text")
    args = parser.parse_args(argv)
    try:
        shallow = subprocess.run(["git", "rev-parse", "--is-shallow-repository"],
                                 capture_output=True, text=True, check=True).stdout.strip()
        if shallow != "false":
            print("ERROR: full history unavailable; fetch with --unshallow before scanning")
            return 1
    except (OSError, subprocess.CalledProcessError):
        print("ERROR: could not establish complete Git history")
        return 1
    diff_hits = scan_diff()
    if diff_hits is None:
        return 1

    message_hits = scan_commit_messages()
    if message_hits is None:
        return 1

    metadata_hits = scan_metadata()
    if metadata_hits is None:
        return 1
    hits = diff_hits + message_hits + metadata_hits
    if args.worktree:
        worktree_hits = scan_worktree()
        if worktree_hits is None:
            return 1
        hits.extend(worktree_hits)

    if hits:
        scope = "history, index or working tree" if args.worktree else "history"
        print(f"{len(hits)} potential disclosure(s) in {scope}:")
        for label, location in hits[:40]:
            print(f"FOUND: {location}: {label} [REDACTED]")
        print("\nA hit that is a false positive belongs in ALLOW_MATCH with a reason.")
        if args.worktree:
            print("Remove real hits from both index and working tree before committing.")
            print("Committed disclosures remain in history after deleting a file.")
        else:
            print("A hit that is real cannot be fixed by deleting the file: the")
            print("history must be rewritten before the repository is made public.")
        return 1

    scope = "full history, index and working tree" if args.worktree else "full history"
    print(f"No credential or identifying detail found in the {scope}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
