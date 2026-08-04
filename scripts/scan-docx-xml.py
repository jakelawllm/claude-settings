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
import re
import sys
import zipfile
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
    re.compile(r"example\.invalid"),
    re.compile(r"nas\.example"),
]

XML_SUFFIXES = (".xml", ".rels")
OFFICE_SUFFIXES = (".docx", ".docm", ".xlsx", ".xlsm", ".pptx", ".pptm")


def iter_office_files(paths: list[Path]) -> list[Path]:
    if paths:
        return [p for p in paths if p.suffix.lower() in OFFICE_SUFFIXES]
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
    return any(a.search(match_text) for a in ALLOW)


def scan_member(document: Path, member: str, text: str) -> list[tuple[str, str]]:
    hits = []
    location = f"{document}:{member}"
    for label, pattern in PATTERNS:
        for match in pattern.finditer(text):
            if is_allowed_match(match.group(0)):
                continue
            hits.append((label, location))
    return hits


def scan_document(path: Path) -> tuple[list[tuple[str, str]], list[str]]:
    hits: list[tuple[str, str]] = []
    errors: list[str] = []
    try:
        with zipfile.ZipFile(path) as zf:
            for member in zf.namelist():
                if not member.endswith(XML_SUFFIXES):
                    continue
                try:
                    text = zf.read(member).decode("utf-8", errors="replace")
                except (KeyError, OSError, zipfile.BadZipFile) as exc:
                    errors.append(f"{path}:{member}: could not read member: {exc}")
                    continue
                hits.extend(scan_member(path, member, text))
    except zipfile.BadZipFile as exc:
        errors.append(f"{path}: not a valid Office zip: {exc}")
    except OSError as exc:
        errors.append(f"{path}: could not read: {exc}")
    return hits, errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan Office XML for credentials and identifying detail.")
    parser.add_argument("paths", nargs="*", help="specific Office files to scan; defaults to repository scan")
    args = parser.parse_args(argv)

    documents = iter_office_files([Path(p) for p in args.paths])
    all_hits: list[tuple[str, str]] = []
    errors: list[str] = []
    for document in documents:
        hits, doc_errors = scan_document(document)
        all_hits.extend(hits)
        errors.extend(doc_errors)

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
    print(f"No credential or identifying detail found in Office XML ({len(documents)} file(s) scanned).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
