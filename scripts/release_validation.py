"""Shared, host-independent validation for the Linux deployment bundle.

These are static checks. The target launcher must still resolve mounted paths
and verify OS isolation; paths on the build host are not deployment evidence.
"""

from __future__ import annotations

import json
import os
import pathlib
import posixpath
import re
import shlex
import tempfile
from datetime import date
from urllib.parse import urlsplit

VERSION_RE = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")
UUID_RE = re.compile(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\Z")
DOMAIN_RE = re.compile(r"(?=.{1,253}\Z)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\Z")
CONTENT_LOG_KEYS = ("OTEL_LOG_USER_PROMPTS", "OTEL_LOG_ASSISTANT_RESPONSES", "OTEL_LOG_TOOL_DETAILS", "OTEL_LOG_TOOL_CONTENT", "OTEL_LOG_RAW_API_BODIES")


def valid_posix_path(value: object) -> bool:
    """Literal absolute target path, never a glob, variable, or root alias."""
    return (
        isinstance(value, str)
        and value.startswith("/") and not value.startswith("//")
        and value == value.strip()
        and not any(ord(c) < 32 or c in "\\*?[]{}$`" for c in value)
        and not any(p in (".", "..") for p in value.split("/"))
        and posixpath.normpath(value) != "/"
        and "REPLACE-WITH" not in value.upper()
        and "PLACEHOLDER" not in value.upper()
    )


def within(parent: str, child: str) -> bool:
    parent = posixpath.normpath(parent)
    child = posixpath.normpath(child)
    return parent == child or child.startswith(parent.rstrip("/") + "/")


def valid_domain(value: object) -> bool:
    return isinstance(value, str) and bool(DOMAIN_RE.fullmatch(value))


def valid_https_endpoint(value: object) -> bool:
    if not isinstance(value, str) or any(c.isspace() for c in value):
        return False
    try:
        parsed = urlsplit(value)
        return bool(parsed.scheme == "https" and parsed.hostname
                    and not parsed.username and not parsed.password
                    and not parsed.fragment and parsed.port != 0)
    except ValueError:
        return False


def valid_date(value: str) -> bool:
    try:
        return bool(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value)) and date.fromisoformat(value) is not None
    except ValueError:
        return False


def version_tuple(value: str) -> tuple[int, ...]:
    return tuple(int(part) for part in value.split("."))


def hook_script(command: object) -> str | None:
    """Accept only a synchronous Node script command without shell expansion."""
    if not isinstance(command, str) or any(c in command for c in ("$", "`", "\n", "\r")):
        return None
    try:
        parts = shlex.split(command)
    except ValueError:
        return None
    if len(parts) != 2 or parts[0] != "node" or pathlib.PurePosixPath(parts[1]).name != "matter-guard.js":
        return None
    # Every accepted spelling quotes the path or contains no shell operators.
    path = parts[1]
    if not pathlib.PurePosixPath(path).is_absolute() and not pathlib.Path(path).is_absolute():
        return None
    if command not in ("node " + shlex.quote(path), 'node "' + path + '"'):
        return None
    return path


def validate_sandbox(sandbox: object) -> list[str]:
    if not isinstance(sandbox, dict):
        return ["sandbox policy must contain a sandbox object"]
    errors = []
    for key, expected in (("enabled", True), ("failIfUnavailable", True), ("allowUnsandboxedCommands", False)):
        if sandbox.get(key) is not expected:
            errors.append(f"sandbox.{key} must be {str(expected).lower()}")
    fs = sandbox.get("filesystem")
    if not isinstance(fs, dict):
        errors.append("sandbox.filesystem must be an object")
    else:
        if fs.get("disabled", False) is not False:
            errors.append("sandbox.filesystem.disabled must be false")
        if fs.get("allowManagedReadPathsOnly") is not True:
            errors.append("sandbox.filesystem.allowManagedReadPathsOnly must be true")
        denies = fs.get("denyRead")
        if not isinstance(denies, list) or "/" not in denies or not all(isinstance(p, str) for p in denies):
            errors.append("sandbox.filesystem.denyRead must include '/' (denying '~' alone leaves other matters readable)")
        for key in ("allowRead", "allowWrite"):
            paths = fs.get(key)
            if not isinstance(paths, list) or not paths or not all(valid_posix_path(p) for p in paths):
                errors.append(f"sandbox.filesystem.{key} must be a non-empty array of literal absolute POSIX paths excluding root")
        writes = fs.get("allowWrite", [])
        reads = fs.get("allowRead", [])
        if isinstance(writes, list) and all(isinstance(p, str) for p in writes):
            matters = [p for p in writes if p != "/tmp/claude-session"]
            if len(matters) != 1:
                errors.append("sandbox.filesystem.allowWrite must select exactly one matter plus optional /tmp/claude-session")
            elif isinstance(reads, list) and matters[0] not in reads:
                errors.append("sandbox.filesystem.allowRead must include the selected writable matter")
    net = sandbox.get("network")
    if not isinstance(net, dict):
        errors.append("sandbox.network must be an object")
    else:
        if net.get("allowManagedDomainsOnly") is not True:
            errors.append("sandbox.network.allowManagedDomainsOnly must be true")
        domains = net.get("allowedDomains")
        if not isinstance(domains, list) or not domains or not all(valid_domain(d) for d in domains):
            errors.append("sandbox.network.allowedDomains must be a non-empty array of exact hostnames (no URLs or wildcards)")
        if net.get("allowLocalBinding", False) is not False:
            errors.append("sandbox.network.allowLocalBinding must be false")
        if net.get("allowAllUnixSockets", False) is not False or net.get("allowUnixSockets", []) != []:
            errors.append("sandbox.network Unix socket access must be disabled")
    if sandbox.get("excludedCommands", []) != []:
        errors.append("sandbox.excludedCommands must be empty")
    if sandbox.get("enableWeakerNestedSandbox", False) is not False:
        errors.append("sandbox.enableWeakerNestedSandbox must be false")
    credentials = sandbox.get("credentials")
    required_credentials = {
        "files": ("path", ("~/.aws", "~/.ssh", "~/.config/gcloud", "~/.azure", "~/.kube", "~/.gnupg", "~/.netrc", "~/.git-credentials", "~/.npmrc", "~/.pypirc")),
        "envVars": ("name", ("GITHUB_TOKEN", "NPM_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "ANTHROPIC_API_KEY")),
    }
    for key, (field, required) in required_credentials.items():
        entries = credentials.get(key) if isinstance(credentials, dict) else None
        if not isinstance(entries, list) or any(not isinstance(entry, dict) or entry.get("mode") != "deny" for entry in entries):
            errors.append(f"sandbox.credentials.{key} must contain deny entries")
        elif not set(required).issubset({entry.get(field) for entry in entries if isinstance(entry.get(field), str)}):
            errors.append(f"sandbox.credentials.{key} is missing required credential denials")
    return errors


def validate_matter_scope(sandbox: dict, roots: list[str]) -> list[str]:
    """The guard takes parent roots; the sandbox must expose one child matter."""
    fs = sandbox.get("filesystem", {})
    if not isinstance(fs, dict):
        return []
    reads, writes = fs.get("allowRead", []), fs.get("allowWrite", [])
    if not isinstance(reads, list) or not isinstance(writes, list):
        return []
    matters = [p for p in writes if isinstance(p, str) and p != "/tmp/claude-session"]
    if len(matters) != 1 or not all(valid_posix_path(root) for root in roots):
        return []
    matter = matters[0]
    parents = [root for root in roots if within(root, matter) and root != matter]
    if not parents or not any(posixpath.dirname(matter) == root.rstrip("/") for root in parents):
        return ["selected sandbox matter must be an immediate child of CLAUDE_MATTER_ROOTS (the parent registry root)"]
    errors = []
    for allowed in reads:
        if not isinstance(allowed, str):
            continue
        for root in roots:
            if within(allowed, root) or (within(root, allowed) and not within(matter, allowed)):
                errors.append("sandbox allowRead exposes a parent or sibling matter through CLAUDE_MATTER_ROOTS")
    return errors


def atomic_write_json(path: pathlib.Path, payload: dict, *, overwrite: bool = True) -> None:
    """Private temporary file, fsync, atomic install; never truncate a bundle."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=path.parent,
                                         prefix=f".{path.name}.", suffix=".tmp", delete=False) as handle:
            temp_path = pathlib.Path(handle.name)
            os.chmod(temp_path, 0o600)
            json.dump(payload, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        if overwrite:
            os.replace(temp_path, path)
        else:
            # Atomic no-clobber install: existence checks alone race another writer.
            os.link(temp_path, path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
