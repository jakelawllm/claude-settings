#!/usr/bin/env python3
"""Generate a per-matter Claude sandbox policy fragment from a validated matter definition.

This script is the only code in this repository that crosses from configuration into
deployment. It reads one approved matter definition and writes a Claude sandbox
policy fragment. It does not create containers, mount filesystems, start processes
or manage records.

    python3 scripts/generate-matter-sandbox.py \\
        --matter-definition matter-definition.json \\
        --output sandbox-policy.json

Exits non-zero on any validation failure, writing nothing to the output path.
On success, writes atomically (temp file + rename) using LF newlines.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any

REQUIRED_FIELDS = [
    "matter_id",
    "name",
    "root",
    "aliases",
    "allowed_tooling_paths",
    "allowed_domains",
    "record_root",
]

PLACEHOLDER_PATTERNS = ("REPLACE-WITH", "PLACEHOLDER")

# Credential paths and env vars from design §4.1 / Claude Code sandbox credentials docs.
CREDENTIAL_DENY_PATHS = [
    "~/.aws",
    "~/.ssh",
    "~/.config/gcloud",
    "~/.azure",
    "~/.kube",
    "~/.gnupg",
    "~/.netrc",
    "~/.git-credentials",
    "~/.npmrc",
    "~/.pypirc",
]

CREDENTIAL_DENY_ENV_VARS = [
    "GITHUB_TOKEN",
    "NPM_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "ANTHROPIC_API_KEY",
]


def is_windows_target(path: str) -> bool:
    """True if path looks like a native Windows target (drive letter or UNC).

    Refuses Windows filesystem targets regardless of the host that runs the
    generator. Linux-style absolute paths remain acceptable on any host.
    """
    if not path:
        return False
    if len(path) >= 2 and path[0].isalpha() and path[1] == ":":
        return True
    if path.startswith("\\\\") or path.startswith("//"):
        return True
    return False


def is_absolute_posix(path: str) -> bool:
    """True for a POSIX absolute path (leading /)."""
    return isinstance(path, str) and path.startswith("/") and not is_windows_target(path)


def contains_placeholder(value: str) -> str | None:
    for pattern in PLACEHOLDER_PATTERNS:
        if pattern in value:
            return pattern
    return None


def canonicalize_posix(path: str) -> str:
    """Normalise a POSIX path for containment checks.

    Collapses . and .. components without following symlinks, ensuring
    validation is host-independent and matches the Linux runtime environment.
    """
    if path.startswith("~"):
        expanded = path.replace("~", "/home/_matter_home", 1)
    else:
        expanded = path
    pure = PurePosixPath(expanded)
    parts: list[str] = []
    for part in pure.parts:
        if part in ("", "."):
            continue
        if part == "..":
            if parts and parts[-1] != "/":
                parts.pop()
            continue
        parts.append(part)
    if not parts:
        return "/"
    if parts[0] == "/":
        rest = parts[1:]
        return "/" + "/".join(rest) if rest else "/"
    return "/".join(parts)


def is_within(parent: str, child: str) -> bool:
    """True if child is parent or a descendant of parent (POSIX, string-level)."""
    parent_c = canonicalize_posix(parent)
    child_c = canonicalize_posix(child)
    if parent_c == child_c:
        return True
    if parent_c == "/":
        return child_c.startswith("/")
    return child_c.startswith(parent_c + "/")


def paths_overlap(a: str, b: str) -> bool:
    return is_within(a, b) or is_within(b, a)


def validate_matter_definition(definition: dict[str, Any]) -> list[str]:
    """Validate the matter definition. Returns list of errors (empty if valid)."""
    errors: list[str] = []

    for field in REQUIRED_FIELDS:
        if field not in definition:
            errors.append(f"Missing required field: {field}")

    if errors:
        return errors

    matter_id = definition["matter_id"]
    if not isinstance(matter_id, str) or not matter_id.strip():
        errors.append("matter_id must be a non-empty string")
    elif contains_placeholder(matter_id):
        errors.append(f"matter_id contains placeholder pattern: {matter_id}")

    name = definition["name"]
    if not isinstance(name, str) or not name.strip():
        errors.append("name must be a non-empty string")
    elif contains_placeholder(name):
        errors.append(f"name contains placeholder pattern: {name}")

    root = definition["root"]
    if not isinstance(root, str) or not root.strip():
        errors.append("root must be a non-empty string")
    else:
        pattern = contains_placeholder(root)
        if pattern:
            errors.append(f"root contains placeholder pattern '{pattern}': {root}")
        if is_windows_target(root):
            errors.append(f"root must not be a native Windows path: {root}")
        elif not is_absolute_posix(root):
            errors.append(f"root must be an absolute POSIX path, got: {root}")
        elif root == "/":
            errors.append("root must not be the filesystem root '/'")

    aliases = definition["aliases"]
    if not isinstance(aliases, list):
        errors.append("aliases must be a list")
    else:
        for i, alias in enumerate(aliases):
            if not isinstance(alias, str):
                errors.append(f"alias[{i}] must be a string")
                continue
            pattern = contains_placeholder(alias)
            if pattern:
                errors.append(f"alias[{i}] contains placeholder pattern '{pattern}': {alias}")
            if is_windows_target(alias):
                errors.append(f"alias[{i}] must not be a native Windows path: {alias}")
            elif not is_absolute_posix(alias):
                errors.append(f"alias[{i}] must be an absolute POSIX path: {alias}")

    allowed_tooling_paths = definition["allowed_tooling_paths"]
    if not isinstance(allowed_tooling_paths, list):
        errors.append("allowed_tooling_paths must be a list")
    else:
        for i, tooling_path in enumerate(allowed_tooling_paths):
            if not isinstance(tooling_path, str):
                errors.append(f"allowed_tooling_paths[{i}] must be a string")
                continue
            pattern = contains_placeholder(tooling_path)
            if pattern:
                errors.append(
                    f"allowed_tooling_paths[{i}] contains placeholder pattern "
                    f"'{pattern}': {tooling_path}"
                )
            if is_windows_target(tooling_path):
                errors.append(
                    f"allowed_tooling_paths[{i}] must not be a native Windows path: "
                    f"{tooling_path}"
                )
            elif not is_absolute_posix(tooling_path):
                errors.append(
                    f"allowed_tooling_paths[{i}] must be an absolute POSIX path: "
                    f"{tooling_path}"
                )
            elif tooling_path == "/":
                errors.append(
                    f"allowed_tooling_paths[{i}] must not be the filesystem root '/'"
                )

    allowed_domains = definition["allowed_domains"]
    if not isinstance(allowed_domains, list):
        errors.append("allowed_domains must be a list")
    else:
        for i, domain in enumerate(allowed_domains):
            if not isinstance(domain, str) or not domain.strip():
                errors.append(f"allowed_domains[{i}] must be a non-empty string")
            elif contains_placeholder(domain):
                errors.append(f"allowed_domains[{i}] contains placeholder pattern: {domain}")

    record_root = definition["record_root"]
    if record_root is not None:
        if not isinstance(record_root, str):
            errors.append("record_root must be a string or null")
        else:
            pattern = contains_placeholder(record_root)
            if pattern:
                errors.append(
                    f"record_root contains placeholder pattern '{pattern}': {record_root}"
                )
            if is_windows_target(record_root):
                errors.append(f"record_root must not be a native Windows path: {record_root}")
            elif not is_absolute_posix(record_root):
                errors.append(f"record_root must be an absolute POSIX path: {record_root}")

    return errors


def check_alias_within_root(alias: str, root: str) -> str | None:
    """Return an error if alias does not resolve under the declared root."""
    if not is_within(root, alias):
        return (
            f"Alias '{alias}' resolves outside declared root '{root}' "
            f"(canonical: '{canonicalize_posix(alias)}' vs "
            f"'{canonicalize_posix(root)}')"
        )
    return None


def check_overlapping_roots(root: str, other_roots: list[str]) -> str | None:
    """Return an error if root overlaps or nests with any other configured root."""
    for other in other_roots:
        if not other:
            continue
        if paths_overlap(root, other):
            if canonicalize_posix(root) == canonicalize_posix(other):
                return f"Root '{root}' is identical to another configured root '{other}'"
            if is_within(other, root):
                return f"Root '{root}' nests inside another configured root '{other}'"
            return f"Root '{root}' contains another configured root '{other}'"
    return None


def dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def generate_sandbox_policy(definition: dict[str, Any]) -> dict[str, Any]:
    """Generate the sandbox policy fragment from a validated matter definition.

    Key names and shapes are grounded in Claude Code sandbox documentation
    (filesystem.denyRead/allowRead/allowWrite/allowManagedReadPathsOnly,
    network.allowedDomains/allowManagedDomainsOnly/allowLocalBinding,
    credentials.files/envVars with mode deny) and design §4.1.
    """
    root = definition["root"]
    aliases = definition["aliases"]
    allowed_tooling_paths = definition["allowed_tooling_paths"]
    allowed_domains = definition["allowed_domains"]

    allow_read = dedupe_preserve([root] + list(aliases) + list(allowed_tooling_paths))
    allow_write = [root, "/tmp/claude-session"]

    return {
        "sandbox": {
            "enabled": True,
            "failIfUnavailable": True,
            "allowUnsandboxedCommands": False,
            "filesystem": {
                "denyRead": ["/", "~"],
                "allowRead": allow_read,
                "allowWrite": allow_write,
                "allowManagedReadPathsOnly": True,
            },
            "network": {
                "allowedDomains": list(allowed_domains),
                "allowManagedDomainsOnly": True,
                "allowLocalBinding": False,
            },
            "credentials": {
                "files": [{"path": p, "mode": "deny"} for p in CREDENTIAL_DENY_PATHS],
                "envVars": [
                    {"name": v, "mode": "deny"} for v in CREDENTIAL_DENY_ENV_VARS
                ],
            },
        }
    }


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON with LF newlines via temp file + os.replace (write-or-nothing)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=str(path.parent),
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as tmp:
            json.dump(payload, tmp, indent=2, ensure_ascii=False)
            tmp.write("\n")
            tmp_path = tmp.name
        os.replace(tmp_path, path)
        tmp_path = None
    finally:
        if tmp_path is not None:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a per-matter Claude sandbox policy fragment",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example matter definition:
{
  "matter_id": "matter-2026-0142",
  "name": "Smith",
  "root": "/srv/matters/Smith",
  "aliases": [],
  "allowed_tooling_paths": ["/usr/bin", "/opt/claude"],
  "allowed_domains": ["api.anthropic.com"],
  "record_root": null
}

On validation failure the script writes nothing and exits non-zero.
        """,
    )
    parser.add_argument(
        "--matter-definition",
        required=True,
        help="Path to matter definition JSON file",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Path to write sandbox policy JSON fragment",
    )
    parser.add_argument(
        "--other-roots",
        default="",
        help="Semicolon-separated list of other configured matter roots for overlap check",
    )

    args = parser.parse_args()
    output_path = Path(args.output)

    try:
        with open(args.matter_definition, "r", encoding="utf-8") as f:
            definition = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in matter definition: {e}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"ERROR: Cannot read matter definition: {e}", file=sys.stderr)
        return 1

    if not isinstance(definition, dict):
        print("ERROR: Matter definition must be a JSON object", file=sys.stderr)
        return 1

    errors = validate_matter_definition(definition)

    root = definition.get("root") if isinstance(definition.get("root"), str) else ""
    aliases = definition.get("aliases") if isinstance(definition.get("aliases"), list) else []

    if root and is_absolute_posix(root) and not contains_placeholder(root):
        for alias in aliases:
            if isinstance(alias, str) and is_absolute_posix(alias):
                alias_error = check_alias_within_root(alias, root)
                if alias_error:
                    errors.append(alias_error)

        other_roots = [r.strip() for r in args.other_roots.split(";") if r.strip()]
        if other_roots:
            overlap_error = check_overlapping_roots(root, other_roots)
            if overlap_error:
                errors.append(overlap_error)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        # Write-or-nothing: never leave a partial policy for a launcher to install.
        return 1

    policy = generate_sandbox_policy(definition)

    try:
        atomic_write_json(output_path, policy)
    except OSError as e:
        print(f"ERROR: Failed to write output: {e}", file=sys.stderr)
        return 1

    print(f"wrote {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
