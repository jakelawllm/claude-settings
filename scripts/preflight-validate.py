"""Validate managed-settings.json for production readiness.

    python scripts/preflight-validate.py

managed-settings.json ships as a deployment template: placeholder values,
observation-mode defaults and a sandbox that tolerates its own absence. Every
one of those is correct for a first checkout and wrong for a production
rollout. This script checks for the specific defaults that must be changed
before the file is deployed to a real matter environment.

Exits non-zero if any ERROR is found. Warnings do not affect the exit code.
"""

import json
import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent


def find_settings_path() -> pathlib.Path:
    candidate = SCRIPT_DIR / "managed-settings.json"
    if candidate.exists():
        return candidate
    candidate = REPO_ROOT / "managed-settings.json"
    if candidate.exists():
        return candidate
    candidate = pathlib.Path.cwd() / "managed-settings.json"
    return candidate


def main() -> int:
    settings_path = find_settings_path()
    if not settings_path.exists():
        print(f"ERROR: managed-settings.json not found (looked at {settings_path})")
        print("FAIL: 1 error(s) found")
        return 1

    settings = json.loads(settings_path.read_text(encoding="utf8"))

    errors = []
    warnings = []

    env = settings.get("env", {})

    matter_roots = env.get("CLAUDE_MATTER_ROOTS", "")
    if "REPLACE-WITH" in matter_roots:
        errors.append("CLAUDE_MATTER_ROOTS still contains a REPLACE-WITH placeholder")

    matter_mode = env.get("CLAUDE_MATTER_MODE", "")
    if matter_mode not in ("enforce", "warn"):
        errors.append(
            f"CLAUDE_MATTER_MODE is {matter_mode!r}, must be 'enforce' or 'warn'"
        )
    elif matter_mode == "warn":
        warnings.append("CLAUDE_MATTER_MODE is 'warn' (observation mode, not production)")

    sandbox = settings.get("sandbox", {})
    if sandbox.get("failIfUnavailable") is False:
        warnings.append("sandbox.failIfUnavailable is false")

    force_login_org_uuid = settings.get("forceLoginOrgUUID", "")
    if "REPLACE-WITH" in force_login_org_uuid:
        errors.append("forceLoginOrgUUID still contains a REPLACE-WITH placeholder")

    otel_endpoint = env.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    telemetry_enabled = env.get("CLAUDE_CODE_ENABLE_TELEMETRY", "")
    if "REPLACE-WITH" in otel_endpoint and telemetry_enabled == "1":
        errors.append(
            "OTEL_EXPORTER_OTLP_ENDPOINT still contains a REPLACE-WITH placeholder "
            "while CLAUDE_CODE_ENABLE_TELEMETRY is '1'"
        )

    claude_md = settings.get("claudeMd", "")
    if "REPLACE-WITH-YOUR-FIRM-NAME" in claude_md:
        warnings.append("claudeMd still contains the REPLACE-WITH-YOUR-FIRM-NAME placeholder")

    for e in errors:
        print(f"ERROR: {e}")
    for w in warnings:
        print(f"WARNING: {w}")

    if errors:
        print(f"FAIL: {len(errors)} error(s) found")
        return 1

    print("PASS: no errors found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
