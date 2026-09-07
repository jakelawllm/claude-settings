#!/usr/bin/env python3
"""Scan Office XML payloads for credentials and identifying detail.

    python3 scripts/scan-docx-xml.py [path ...]

Git history scanning does not see text stored inside .docx zip members, and a
practice identifier committed once into document metadata remains in history.
This scanner unpacks Office documents and applies the same narrow disclosure
checks used by scripts/scan-history.py. Findings are reported by document and
member path only; the matched value is not printed.
"""

from __future__ import annotations

import argparse
import io
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


def iter_office_files(paths: list[Path]) -> list[Path]:
    if paths:
        for p in paths:
            if not p.is_file() or p.suffix.lower() not in OFFICE_SUFFIXES:
                raise ValueError("each explicit input must be an existing Office file")
        return paths
    ignored_parts = {".git", ".venv", "node_modules", "dist", "__pycache__"}
    found = []
    for p in Path(".").rglob("*"):
        if any(part in ignored_parts for part in p.parts):
            continue
        if p.suffix.lower() in OFFICE_SUFFIXES:
            found.append(p)
    return found


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
        with zipfile.ZipFile(io.BytesIO(payload) if payload is not None else path) as zf:
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
                except (KeyError, OSError, zipfile.BadZipFile, RuntimeError, ValueError, ET.ParseError):
                    errors.append(f"{location}: unreadable or unsupported XML member")
                    continue
                # Word splits a single visible word between runs when formatting
                # changes. Scan joined text and decoded attributes, not raw tags.
                hits.extend(scan_member(path, member, "".join(root.itertext())))
                for element in root.iter():
                    for value in element.attrib.values():
                        hits.extend(scan_member(path, member, value))
    except (zipfile.BadZipFile, OSError):
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
    parser.add_argument("--history", action="store_true", help="also scan Office blobs reachable from all local Git refs")
    args = parser.parse_args(argv)

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
    print(f"No credential or identifying detail found in Office XML ({len(documents)} file(s), {historical_count} historical blob(s) scanned).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
