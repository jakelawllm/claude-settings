#!/usr/bin/env python3
"""Scan Office XML payloads for credentials and identifying detail.

    python3 scripts/scan-docx-xml.py [--worktree] [--history] [path ...]

Git history scanning does not see text stored inside .docx zip members, and a
practice identifier committed once into document metadata remains in history.
This scanner unpacks Office documents and applies the same narrow disclosure
checks used by scripts/scan-history.py. Findings are reported by document and
member path only; the matched value is not printed.
"""

from __future__ import annotations

import argparse
import io
import os
import stat
import re
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Anthropic key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{16,}")),
    ("GitHub token", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("GitHub PAT", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("Private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("Slack token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    (
        "Generic assignment",
        re.compile(r"\b(api[_-]?key|secret|passwd|password)\b\s*[:=]\s*['\"][^'\"]{8,}", re.IGNORECASE),
    ),
    ("Private IPv4 (192.168.x.x)", re.compile(r"\b192\.168\.\d{1,3}\.\d{1,3}\b")),
    (
        "Private IPv4 (172.16-31.x.x)",
        re.compile(r"\b172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}\b"),
    ),
    ("Private IPv4 (10.x.x.x)", re.compile(r"\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")),
    ("Tailscale host", re.compile(r"\b[a-z0-9-]+\.ts\.net\b")),
    ("UNC path", re.compile(r"\\\\[a-zA-Z0-9_.-]+\\[a-zA-Z0-9_.$-]+")),
]

ALLOW: list[re.Pattern[str]] = [
    re.compile(r"^\\\\nas\.example\\[A-Za-z0-9_.$-]+$"),
]

XML_SUFFIXES = (".xml", ".rels")
OFFICE_SUFFIXES = (".docx", ".docm", ".xlsx", ".xlsm", ".pptx", ".pptm")
MAX_MEMBER_BYTES = 16 * 1024 * 1024
MAX_DOCUMENT_BYTES = 64 * 1024 * 1024


def safe_location(value: str) -> str:
    for _, pattern in PATTERNS:
        value = pattern.sub("[REDACTED]", value)
    return re.sub(r"[\x00-\x1f\x7f]", "?", value)


def git_output(args: list[str], root: Path | None = None) -> bytes:
    """Never expose Git stderr: errors and filenames can themselves contain secrets."""
    return subprocess.run(["git", *args], cwd=root, capture_output=True,
                          check=True, timeout=30).stdout


def repository_files() -> tuple[Path, list[str], list[tuple[str, str, str]]]:
    """Git prunes ignored runtime trees before enumeration, including new files.

    Tracked files remain eligible even when an ignore rule also matches them.
    NUL delimiters preserve hostile filenames without treating them as options.
    """
    root = Path(os.fsdecode(git_output(["rev-parse", "--show-toplevel"]).removesuffix(b"\n").removesuffix(b"\r")))
    names: set[str] = set()
    staged = []
    for row in git_output(["ls-files", "--stage", "-z"], root).split(b"\0"):
        if not row:
            continue
        header, sep, raw_name = row.partition(b"\t")
        fields = header.split()
        if not sep or len(fields) != 3:
            raise ValueError("invalid Office index listing")
        mode, oid, stage = (field.decode("ascii") for field in fields)
        if stage != "0":
            raise ValueError("unresolved index conflicts prevent complete Office scanning")
        if not re.fullmatch(r"[0-9a-f]{40,64}", oid):
            raise ValueError("invalid Office index object")
        name = os.fsdecode(raw_name)
        validate_repository_name(name)
        if name.lower().endswith(OFFICE_SUFFIXES):
            names.add(name)
            staged.append((name, mode, oid))
    for raw_name in git_output(["ls-files", "--others", "--exclude-standard", "-z"], root).split(b"\0"):
        if raw_name:
            name = os.fsdecode(raw_name)
            validate_repository_name(name)
            if name.lower().endswith(OFFICE_SUFFIXES):
                names.add(name)
    return root, sorted(names), staged


def validate_repository_name(name: str) -> None:
    if not name or Path(name).is_absolute() or Path(name).drive or ".." in Path(name).parts:
        raise ValueError("invalid Office repository path")


def unsafe_link(info: os.stat_result) -> bool:
    # Windows junctions/reparse points must not become a route outside the checkout.
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def read_office_payload(path: Path) -> bytes:
    """Read a bounded regular file without following filesystem symlink targets."""
    absolute = Path(os.path.abspath(path))
    parts = absolute.parts
    current = Path(parts[0])
    parents = []
    for part in parts[1:-1]:
        current /= part
        info = current.lstat()
        if unsafe_link(info) or not stat.S_ISDIR(info.st_mode):
            raise ValueError("unsafe Office path")
        parents.append((current, info))
    before = absolute.lstat()
    if unsafe_link(before) or not stat.S_ISREG(before.st_mode):
        raise ValueError("Office input must be a regular file without symlinks")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    parent_fd = None
    try:
        if os.open in os.supports_dir_fd and hasattr(os, "O_DIRECTORY"):
            parent_fd = os.open(parts[0], flags | os.O_DIRECTORY)
            for part in parts[1:-1]:
                next_fd = os.open(part, flags | os.O_DIRECTORY, dir_fd=parent_fd)
                os.close(parent_fd)
                parent_fd = next_fd
            fd = os.open(parts[-1], flags, dir_fd=parent_fd)
        else:
            fd = os.open(absolute, flags)
        with os.fdopen(fd, "rb") as source:
            opened = os.fstat(source.fileno())
            if not stat.S_ISREG(opened.st_mode) or (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
                raise ValueError("Office file changed before scanning")
            # Verify parents before reading on platforms without openat/O_NOFOLLOW.
            for parent, old in parents:
                now = parent.lstat()
                if unsafe_link(now) or (old.st_dev, old.st_ino) != (now.st_dev, now.st_ino):
                    raise ValueError("Office parent changed before scanning")
            if opened.st_size > MAX_DOCUMENT_BYTES:
                raise ValueError("Office scan size limit exceeded")
            payload = source.read(MAX_DOCUMENT_BYTES + 1)
            after = os.fstat(source.fileno())
            if len(payload) > MAX_DOCUMENT_BYTES:
                raise ValueError("Office scan size limit exceeded")
            if (opened.st_size, opened.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError("Office file changed while scanning")
            return payload
    finally:
        if parent_fd is not None:
            os.close(parent_fd)


def iter_office_files(paths: list[Path]) -> list[Path]:
    # Explicit paths stay usable outside a Git checkout; unsafe targets fail closed.
    for p in paths:
        try:
            info = p.lstat()
        except OSError:
            raise ValueError("each explicit input must be an existing Office file") from None
        if unsafe_link(info) or not stat.S_ISREG(info.st_mode) or p.suffix.lower() not in OFFICE_SUFFIXES:
            raise ValueError("each explicit input must be an existing regular Office file without symlinks")
    return paths


def scan_worktree(include_index: bool) -> tuple[list[tuple[str, str]], list[str], int, int]:
    hits, errors, count, staged_count = [], [], 0, 0
    try:
        root, names, staged = repository_files()
        tracked = {name for name, _, _ in staged}
        for name in names:
            path = root / name
            try:
                payload = read_office_payload(path)
            except FileNotFoundError:
                # A worktree deletion does not delete its independently scanned index blob.
                if name not in tracked:
                    errors.append(f"{safe_location(name)}: new Office file disappeared before scanning")
                continue
            except (OSError, ValueError):
                errors.append(f"{safe_location(name)}: unreadable or unsafe Office file")
                continue
            count += 1
            found, failures = scan_document(Path(name), payload)
            hits.extend(found)
            errors.extend(failures)
        if include_index:
            for name, mode, oid in staged:
                if mode not in {"100644", "100755"}:
                    errors.append(f"{safe_location(name)}: unsupported staged Office file mode")
                    continue
                staged_count += 1
                size = int(git_output(["cat-file", "-s", oid], root))
                if size < 0 or size > MAX_DOCUMENT_BYTES:
                    errors.append(f"staged blob {oid[:12]}: Office scan size limit exceeded")
                    continue
                payload = git_output(["cat-file", "blob", oid], root)
                if len(payload) != size:
                    raise ValueError("incomplete Office index blob")
                found, failures = scan_document(Path(f"staged-blob-{oid[:12]}"), payload)
                hits.extend(found)
                errors.extend(failures)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
        errors.append("could not completely enumerate or read Office worktree/index")
    return hits, errors, count, staged_count


def is_allowed_match(match_text: str) -> bool:
    """Return true only when this matched value is an allowed synthetic value.

    Do not skip an entire XML member because it contains an allowed example
    elsewhere. Office XML is often minified into one line, so member-level or
    line-level allowlisting can hide a real secret beside a harmless example.
    """
    return any(a.fullmatch(match_text) for a in ALLOW)


def scan_member(document: Path, member: str, text: str) -> list[tuple[str, str]]:
    hits = []
    location = safe_location(f"{document}:{member}")
    for label, pattern in PATTERNS:
        for match in pattern.finditer(text):
            if is_allowed_match(match.group(0)):
                continue
            hits.append((label, location))
    return hits


def scan_document(path: Path, payload: bytes | None = None) -> tuple[list[tuple[str, str]], list[str]]:
    hits: list[tuple[str, str]] = []
    errors: list[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(payload if payload is not None else read_office_payload(path))) as zf:
            total = 0
            for info in zf.infolist():
                member = info.filename
                location = safe_location(f"{path}:{member}")
                if not member.lower().endswith(XML_SUFFIXES):
                    continue
                total += info.file_size
                if info.file_size > MAX_MEMBER_BYTES or total > MAX_DOCUMENT_BYTES:
                    errors.append(f"{location}: XML scan size limit exceeded")
                    continue
                try:
                    data = zf.read(info)
                    # Office XML has no need for a DTD. Reject entity declarations
                    # before parsing, including UTF-16 encodings with NUL bytes.
                    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", data.replace(b"\0", b""), re.I):
                        raise ValueError("DTD/entity declarations are unsupported")
                    root = ET.fromstring(data)
                except (LookupError, OSError, zipfile.BadZipFile, RuntimeError, ValueError, ET.ParseError):
                    errors.append(f"{location}: unreadable or unsupported XML member")
                    continue
                # Word splits a single visible word between runs when formatting
                # changes. Scan joined text and decoded attributes, not raw tags.
                hits.extend(scan_member(path, member, "".join(root.itertext())))
                for element in root.iter():
                    for value in element.attrib.values():
                        hits.extend(scan_member(path, member, value))
    except (zipfile.BadZipFile, OSError, ValueError):
        errors.append(f"{safe_location(str(path))}: unreadable Office zip")
    return list(dict.fromkeys(hits)), errors


def scan_history() -> tuple[list[tuple[str, str]], list[str], int]:
    """Scan every distinct Office blob reachable from local Git refs."""
    hits, errors, count = [], [], 0
    try:
        shallow = subprocess.run(["git", "rev-parse", "--is-shallow-repository"],
                                 capture_output=True, check=True, text=True).stdout.strip()
        if shallow != "false":
            return [], ["full Office history unavailable; fetch with --unshallow before scanning"], 0
        result = subprocess.run(["git", "rev-list", "--objects", "--all"],
                                capture_output=True, check=True, text=True, encoding="utf-8", errors="replace")
        for line in result.stdout.splitlines():
            oid, _, name = line.partition(" ")
            if not name.lower().endswith(OFFICE_SUFFIXES):
                continue
            # Only a validated object ID is sent to git; paths cannot become options.
            if not re.fullmatch(r"[0-9a-f]{40,64}", oid):
                raise ValueError("invalid object ID")
            count += 1
            size = subprocess.run(["git", "cat-file", "-s", oid], capture_output=True, check=True, text=True)
            if int(size.stdout) > MAX_DOCUMENT_BYTES:
                errors.append(f"blob {oid[:12]}: Office scan size limit exceeded")
                continue
            blob = subprocess.run(["git", "cat-file", "blob", oid], capture_output=True, check=True).stdout
            found, failures = scan_document(Path(f"blob-{oid[:12]}"), blob)
            hits.extend(found)
            errors.extend(failures)
    except (OSError, subprocess.CalledProcessError, ValueError):
        errors.append("could not read complete Office history")
    return hits, errors, count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan Office XML for credentials and identifying detail.")
    parser.add_argument("paths", nargs="*", help="specific Office files to scan; defaults to repository scan")
    parser.add_argument("--worktree", action="store_true", help="scan Git-listed working files and staged Office blobs independently")
    parser.add_argument("--history", action="store_true", help="also scan Office blobs reachable from all local Git refs")
    args = parser.parse_args(argv)

    if args.worktree and args.paths:
        parser.error("--worktree cannot be combined with explicit paths")
    try:
        documents = iter_office_files([Path(p) for p in args.paths])
    except ValueError as exc:
        parser.error(str(exc))
    all_hits: list[tuple[str, str]] = []
    errors: list[str] = []
    for document in documents:
        hits, doc_errors = scan_document(document)
        all_hits.extend(hits)
        errors.extend(doc_errors)
    working_count, staged_count = len(documents), 0
    if not args.paths:
        hits, failures, working_count, staged_count = scan_worktree(args.worktree)
        all_hits.extend(hits)
        errors.extend(failures)
    historical_count = 0
    if args.history:
        hits, failures, historical_count = scan_history()
        all_hits.extend(hits)
        errors.extend(failures)

    for error in errors:
        print(f"ERROR: {error}")
    if all_hits:
        print(f"{len(all_hits)} potential disclosure(s) in Office XML:")
        for label, location in all_hits[:40]:
            print(f"FOUND: {location}: {label} [REDACTED]")
        print("\nA real hit must be removed from the source document before release.")
        return 1
    if errors:
        print(f"FAIL: {len(errors)} unreadable Office member(s)")
        return 1
    print(f"No credential or identifying detail found in Office XML ({working_count} file(s), {staged_count} staged blob(s), {historical_count} historical blob(s) scanned).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
