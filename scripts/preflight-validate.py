"""Validate a managed settings file before it is deployed.

    python scripts/preflight-validate.py --mode template managed-settings.json
    python scripts/preflight-validate.py --mode production dist/managed-settings.production.json

Two different questions are being asked, and conflating them is what made the
earlier single-mode script ambiguous.

**Template mode** asks whether the checked-in file is a valid deployment
template. Placeholders are expected here and are reported as warnings, not
errors: `managed-settings.json` ships with them deliberately, and a template
that had them filled in would be a repository leaking a firm's own values.
Template mode fails only on structural faults — malformed JSON, a missing
hooks block, a mode outside the permitted set.

**Production mode** asks whether a rendered file is safe to deploy to a real
matter environment. Every placeholder is a blocker, observation-mode defaults
are blockers, and a sandbox that tolerates its own absence is a blocker.

This is an engineering readiness gate. It checks that the deployment
preconditions this repository can see are met. It is not a compliance
certification and it does not speak to whether the practice's obligations
under its own policy are discharged.

Exits non-zero if any ERROR is found. Warnings do not affect the exit code.
"""

import argparse
import json
import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

PLACEHOLDER = "REPLACE-WITH"

# The hook command is a literal path in a managed settings file — there is no
# variable expansion — so production validation checks the shape rather than a
# single hardcoded path. A deployment on macOS legitimately differs from Linux.
EXPECTED_HOOK_FRAGMENT = "matter-guard.js"

# Events the guard must be wired to for the production claims to hold.
# PreToolUse does the enforcement; SessionEnd files the record.
REQUIRED_HOOK_EVENTS = ("PreToolUse", "SessionEnd")

# Managed-only controls the README requires for a production deployment.
# Each is (key, required value, why it is load-bearing).
REQUIRED_MANAGED_CONTROLS = (
    ("allowManagedHooksOnly", True, "a user could otherwise disable the guard"),
    ("allowManagedMcpServersOnly", True, "an unapproved MCP server could otherwise load"),
    ("forceRemoteSettingsRefresh", True, "a machine on cached policy could otherwise run"),
    ("disableArtifact", True, "the artifact tool publishes session output"),
    ("disableRemoteControl", True, "Remote Control stores the transcript on Anthropic servers"),
)


def find_default_settings_path() -> pathlib.Path:
    for candidate in (
        SCRIPT_DIR / "managed-settings.json",
        REPO_ROOT / "managed-settings.json",
        pathlib.Path.cwd() / "managed-settings.json",
    ):
        if candidate.exists():
            return candidate
    return REPO_ROOT / "managed-settings.json"


def has_placeholder(value) -> bool:
    return isinstance(value, str) and PLACEHOLDER in value


def is_absolute_path(p: str) -> bool:
    r"""Cross-platform absolute path test matching the guard's runtime check.
    
    Accepts Windows drive letters (C:\), UNC (\\server\share), and POSIX (/).
    The guard uses /^([a-zA-Z]:[\\/]|\\\\|\/\/|\/)/ which matches all three.
    """
    import re
    return bool(re.match(r'^([a-zA-Z]:[/\\]|\\\\|//|/)', p))


def collect_hook_commands(hooks: dict, event: str) -> list:
    """Every command string registered against one hook event."""
    commands = []
    for entry in hooks.get(event, []) or []:
        if not isinstance(entry, dict):
            continue
        for hook in entry.get("hooks", []) or []:
            if isinstance(hook, dict) and isinstance(hook.get("command"), str):
                commands.append(hook["command"])
    return commands


def check_structure(settings: dict, errors: list, warnings: list) -> None:
    """Faults that are wrong in a template as well as in a rendered file."""
    env = settings.get("env", {})
    if not isinstance(env, dict):
        errors.append("env is not an object")
        return

    matter_mode = env.get("CLAUDE_MATTER_MODE", "")
    if matter_mode not in ("enforce", "warn", "off"):
        errors.append(
            f"CLAUDE_MATTER_MODE is {matter_mode!r}, must be 'enforce', 'warn' or 'off'"
        )

    sandbox = settings.get("sandbox", {})
    if not isinstance(sandbox, dict):
        errors.append("sandbox is not an object")

    hooks = settings.get("hooks", {})
    if not isinstance(hooks, dict) or not hooks:
        errors.append("no hooks block: the matter guard is not wired up")
        return

    for event in REQUIRED_HOOK_EVENTS:
        commands = collect_hook_commands(hooks, event)
        if not commands:
            errors.append(f"no {event} hook registered: the matter guard is not wired up")
            continue
        if not any(EXPECTED_HOOK_FRAGMENT in c for c in commands):
            errors.append(
                f"{event} hook does not invoke {EXPECTED_HOOK_FRAGMENT}: "
                "the registered command is not the matter guard"
            )


def check_template(settings: dict, errors: list, warnings: list) -> None:
    """Placeholders are expected. Report them so the operator sees the work list."""
    env = settings.get("env", {})

    if has_placeholder(env.get("CLAUDE_MATTER_ROOTS", "")):
        warnings.append(
            "CLAUDE_MATTER_ROOTS is a placeholder (expected in the template; "
            "the guard refuses placeholder roots rather than matching nothing)"
        )
    if has_placeholder(settings.get("forceLoginOrgUUID", "")):
        warnings.append("forceLoginOrgUUID is a placeholder (expected in the template)")
    if has_placeholder(env.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")):
        warnings.append("OTEL_EXPORTER_OTLP_ENDPOINT is a placeholder (expected in the template)")
    if has_placeholder(settings.get("claudeMd", "")):
        warnings.append("claudeMd carries the firm-name placeholder (expected in the template)")

    if env.get("CLAUDE_MATTER_MODE") == "warn":
        warnings.append("CLAUDE_MATTER_MODE is 'warn' (observation mode, not production)")

    sandbox = settings.get("sandbox", {})
    if isinstance(sandbox, dict) and sandbox.get("failIfUnavailable") is not True:
        warnings.append("sandbox.failIfUnavailable is not true (not production)")


def check_production(settings: dict, errors: list, warnings: list) -> None:
    """Every template default that is wrong for a real deployment is a blocker."""
    env = settings.get("env", {})

    matter_roots = env.get("CLAUDE_MATTER_ROOTS", "")
    if not matter_roots:
        errors.append("CLAUDE_MATTER_ROOTS is unset: the guard refuses all file access")
    elif has_placeholder(matter_roots):
        errors.append("CLAUDE_MATTER_ROOTS still contains a REPLACE-WITH placeholder")
    else:
        # Each semicolon-separated root must be absolute. The guard rejects
        # relative roots outright, so a file with one is not deployable.
        for root in matter_roots.split(";"):
            root = root.strip()
            if root and not is_absolute_path(root):
                errors.append(f"CLAUDE_MATTER_ROOTS contains a relative path: {root!r}")

    org_uuid = settings.get("forceLoginOrgUUID", "")
    if not org_uuid:
        errors.append(
            "forceLoginOrgUUID is absent: clause 6.8 prohibits a personal account, "
            "and forceLoginMethod does not reach the account"
        )
    elif has_placeholder(org_uuid):
        errors.append("forceLoginOrgUUID still contains a REPLACE-WITH placeholder")

    telemetry_enabled = env.get("CLAUDE_CODE_ENABLE_TELEMETRY", "") == "1"
    otel_endpoint = env.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if telemetry_enabled:
        if not otel_endpoint:
            errors.append(
                "CLAUDE_CODE_ENABLE_TELEMETRY is '1' but OTEL_EXPORTER_OTLP_ENDPOINT is missing"
            )
        elif has_placeholder(otel_endpoint):
            errors.append(
                "OTEL_EXPORTER_OTLP_ENDPOINT still contains a REPLACE-WITH placeholder "
                "while CLAUDE_CODE_ENABLE_TELEMETRY is '1'"
            )
    else:
        warnings.append(
            "telemetry is disabled: the practice has no record of what was sent, "
            "which clause 17.5 requires be recorded in Schedules 1 and 8"
        )

    matter_mode = env.get("CLAUDE_MATTER_MODE", "")
    if matter_mode != "enforce":
        errors.append(
            f"CLAUDE_MATTER_MODE is {matter_mode!r}, must be 'enforce' for production"
        )

    sandbox = settings.get("sandbox", {})
    if isinstance(sandbox, dict):
        if sandbox.get("enabled") is not True:
            errors.append("sandbox.enabled is not true: nothing at the OS level contains Bash")
        if sandbox.get("failIfUnavailable") is not True:
            errors.append(
                "sandbox.failIfUnavailable is not true: a machine without a sandbox "
                "starts anyway and runs unprotected"
            )
        if sandbox.get("allowUnsandboxedCommands") is not False:
            errors.append("sandbox.allowUnsandboxedCommands is not false")

    if has_placeholder(settings.get("claudeMd", "")):
        errors.append("claudeMd still contains a REPLACE-WITH placeholder")

    for key, expected, why in REQUIRED_MANAGED_CONTROLS:
        if settings.get(key) is not expected:
            errors.append(f"{key} is not {json.dumps(expected)}: {why}")

    # The keys checked above can have placeholders in the template, and nested
    # holders were already checked in their specific contexts. Scan the entire
    # remaining structure for any missed REPLACE-WITH values. Skip inline
    # deployment notes (_template_comment, _telemetry_note, etc.) only.
    def find_placeholders(obj, path=""):
        found = []
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key.startswith("_"):
                    continue
                found.extend(find_placeholders(value, f"{path}.{key}" if path else key))
        elif isinstance(obj, list):
            for i, value in enumerate(obj):
                found.extend(find_placeholders(value, f"{path}[{i}]"))
        elif isinstance(obj, str) and PLACEHOLDER in obj:
            found.append(path or "<root>")
        return found
    
    remaining = find_placeholders(settings)
    if remaining:
        errors.append(
            "these keys still contain a REPLACE-WITH placeholder: "
            + ", ".join(remaining)
        )


def validate(settings_path: pathlib.Path, mode: str, quiet: bool = False) -> int:
    if not settings_path.exists():
        print(f"ERROR: settings file not found ({settings_path})")
        print("FAIL: 1 error(s) found")
        return 1

    try:
        settings = json.loads(settings_path.read_text(encoding="utf8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: {settings_path} is not valid JSON: {exc}")
        print("FAIL: 1 error(s) found")
        return 1

    if not isinstance(settings, dict):
        print(f"ERROR: {settings_path} is not a JSON object")
        print("FAIL: 1 error(s) found")
        return 1

    errors: list = []
    warnings: list = []

    check_structure(settings, errors, warnings)
    if mode == "template":
        check_template(settings, errors, warnings)
    else:
        check_production(settings, errors, warnings)

    for e in errors:
        print(f"ERROR: {e}")
    if not quiet:
        for w in warnings:
            print(f"WARNING: {w}")

    if errors:
        print(f"FAIL: {len(errors)} error(s) found [{mode} mode: {settings_path}]")
        return 1

    if mode == "template":
        print(f"PASS: valid deployment template [{settings_path}]")
        print(
            "NOTE: template validity is not deployment validity. Render a production "
            "file and run --mode production against it before deploying."
        )
    else:
        print(f"PASS: production preconditions met [{settings_path}]")
        print(
            "NOTE: this is an engineering readiness gate, not a compliance "
            "certification. It does not verify OS sandbox availability, hook "
            "installation, or the practice's own policy obligations."
        )
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate a managed settings file before deployment.",
    )
    parser.add_argument(
        "settings",
        nargs="?",
        help="path to the settings file (defaults to managed-settings.json)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress warnings and notes; print only blocking errors",
    )
    parser.add_argument(
        "--mode",
        choices=("template", "production"),
        default="template",
        help=(
            "template: placeholders are expected and reported as warnings. "
            "production: placeholders and observation-mode defaults are blockers."
        ),
    )
    args = parser.parse_args(argv)

    settings_path = (
        pathlib.Path(args.settings).resolve()
        if args.settings
        else find_default_settings_path()
    )
    return validate(settings_path, args.mode, args.quiet)


if __name__ == "__main__":
    sys.exit(main())
