"""Generate and verify a release manifest for a production bundle.

    python3 scripts/generate-release-manifest.py \
        --output dist/release-manifest.json \
        --production-settings dist/managed-settings.production.json \
        --sandbox-policy dist/sandbox-policy.json

The manifest contains hashes of all critical artefacts and the certified
Claude Code version range. Signature and installer verification are deployment
responsibilities outside this repository.

Verify an existing manifest by recomputing the hashes from the same artefacts:

    python3 scripts/generate-release-manifest.py \
        --verify \
        --output dist/release-manifest.json \
        --production-settings dist/managed-settings.production.json \
        --sandbox-policy dist/sandbox-policy.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
HEX64 = re.compile(r"^[a-f0-9]{64}$")
SHA40 = re.compile(r"^[a-f0-9]{40}$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+")

REQUIRED_FIELDS = (
    "commit_sha",
    "tree_state",
    "generated_at",
    "claude_code_version",
    "hook_hash",
    "settings_template_hash",
    "production_settings_hash",
    "sandbox_policy_hash",
    "compliance_skill_hash",
    "dependency_lock_hash",
    "minimum_version",
    "maximum_version",
)


def sha256_file(path: pathlib.Path) -> str:
    """Return SHA-256 hex digest of a required file."""
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(str(path))
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def get_commit_sha() -> str:
    """Return the current git commit SHA, or raise if unavailable."""
    r = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return r.stdout.strip()


def get_tree_state(allow_dirty: bool) -> str:
    """Return 'clean' or 'dirty'. If dirty and allow_dirty is false, raise."""
    r = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    if r.stdout.strip():
        if not allow_dirty:
            raise RuntimeError(
                "working tree is dirty; use --allow-dirty to record a dirty-tree manifest"
            )
        return "dirty"
    return "clean"


def load_json(path: pathlib.Path, label: str) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"{label} file not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{label} file is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{label} file must contain a JSON object")
    return payload


def get_version_from_settings(settings: dict[str, Any]) -> tuple[str, str]:
    """Extract requiredMinimumVersion and requiredMaximumVersion from settings."""
    min_version = str(settings.get("requiredMinimumVersion", ""))
    max_version = str(settings.get("requiredMaximumVersion", ""))
    if not VERSION_RE.match(min_version):
        raise ValueError("production settings missing valid requiredMinimumVersion")
    if not VERSION_RE.match(max_version):
        raise ValueError("production settings missing valid requiredMaximumVersion")
    return min_version, max_version


def build_manifest(production_settings_path: pathlib.Path, sandbox_policy_path: pathlib.Path, tree_state: str) -> dict[str, Any]:
    """Build the manifest from required artefacts and repo state."""
    settings = load_json(production_settings_path, "production settings")
    # Load to prove it is JSON too, not only hashable bytes.
    load_json(sandbox_policy_path, "sandbox policy")
    min_version, max_version = get_version_from_settings(settings)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    return {
        "commit_sha": get_commit_sha(),
        "tree_state": tree_state,
        "generated_at": generated_at,
        "claude_code_version": min_version,
        "hook_hash": sha256_file(REPO_ROOT / "hooks" / "matter-guard.js"),
        "settings_template_hash": sha256_file(REPO_ROOT / "managed-settings.json"),
        "production_settings_hash": sha256_file(production_settings_path),
        "sandbox_policy_hash": sha256_file(sandbox_policy_path),
        "compliance_skill_hash": sha256_file(REPO_ROOT / "skills" / "ai-policy-compliance" / "SKILL.md"),
        "dependency_lock_hash": sha256_file(REPO_ROOT / "requirements-lock.txt"),
        "minimum_version": min_version,
        "maximum_version": max_version,
    }


def validate_shape(manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    missing = [k for k in REQUIRED_FIELDS if not manifest.get(k)]
    if missing:
        errors.append(f"manifest missing required fields: {', '.join(missing)}")
    if manifest.get("commit_sha") and not SHA40.match(str(manifest["commit_sha"])):
        errors.append("commit_sha is not a 40-character lowercase git SHA")
    for key in (
        "hook_hash",
        "settings_template_hash",
        "production_settings_hash",
        "sandbox_policy_hash",
        "compliance_skill_hash",
        "dependency_lock_hash",
    ):
        if manifest.get(key) and not HEX64.match(str(manifest[key])):
            errors.append(f"{key} is not a 64-character lowercase SHA-256 hash")
    for key in ("claude_code_version", "minimum_version", "maximum_version"):
        if manifest.get(key) and not VERSION_RE.match(str(manifest[key])):
            errors.append(f"{key} is not a semantic version prefix")
    if manifest.get("generated_at") and not str(manifest["generated_at"]).endswith("Z"):
        errors.append("generated_at must be a UTC timestamp ending in Z")
    return errors


def print_manifest(title: str, manifest: dict[str, Any]) -> None:
    print(title)
    for key, value in manifest.items():
        print(f"  {key}: {value}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate and verify a release manifest for a production bundle.")
    parser.add_argument("--output", required=True, help="path to write or verify the manifest JSON file")
    parser.add_argument("--production-settings", required=True, help="path to the rendered production settings file")
    parser.add_argument("--sandbox-policy", required=True, help="path to the generated sandbox policy JSON file")
    parser.add_argument("--verify", action="store_true", help="recompute and compare manifest hashes")
    parser.add_argument("--allow-dirty", action="store_true", help="record manifest from a dirty working tree")
    args = parser.parse_args()

    output_path = pathlib.Path(args.output).resolve()
    production_settings_path = pathlib.Path(args.production_settings).resolve()
    sandbox_policy_path = pathlib.Path(args.sandbox_policy).resolve()

    try:
        tree_state = get_tree_state(allow_dirty=args.allow_dirty)
        expected = build_manifest(production_settings_path, sandbox_policy_path, tree_state)
    except (FileNotFoundError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}")
        return 1

    if args.verify:
        try:
            actual = load_json(output_path, "manifest")
        except (FileNotFoundError, ValueError) as exc:
            print(f"ERROR: {exc}")
            return 1
        errors = validate_shape(actual)
        for key, expected_value in expected.items():
            if key == "generated_at":
                continue
            if actual.get(key) != expected_value:
                errors.append(
                    f"{key} mismatch: expected {expected_value}, got {actual.get(key)}"
                )
        if errors:
            for error in errors:
                print(f"ERROR: {error}")
            print(f"FAIL: {len(errors)} manifest error(s) found")
            return 1
        print_manifest("Manifest verification:", actual)
        print("OK: manifest hashes match current artefacts")
        return 0

    errors = validate_shape(expected)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"FAIL: {len(errors)} manifest error(s) found")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(expected, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"wrote {output_path}")
    print_manifest("Manifest contents:", expected)
    return 0


if __name__ == "__main__":
    sys.exit(main())
