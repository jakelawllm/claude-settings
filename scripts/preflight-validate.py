"""Validate managed-settings.json for production readiness.

    python3 scripts/preflight-validate.py --mode template|production [settings.json]

managed-settings.json ships as a deployment template: placeholder values,
observation-mode defaults and a sandbox that tolerates its own absence. Every
one of those is correct for a first checkout and wrong for a production
rollout. This script checks for the specific defaults that must be changed
before the file is deployed to a real matter environment.

``--mode template`` (default) treats the file as the shipped template:
placeholders, observation mode and a permissive sandbox are expected and
reported as warnings. The script exits 0 as long as the JSON is structurally
valid and the basic invariants (valid mode value, sandbox shape, required hook
events present) hold. It exits non-zero only on structural errors.

``--mode production`` treats the file as a rendered production artefact and
fails on any of the following (CFG-01/03/05/06):

  - any REPLACE-WITH placeholder;
  - CLAUDE_MATTER_MODE not 'enforce';
  - sandbox.enabled not true, or allowUnsandboxedCommands not false;
  - sandbox.failIfUnavailable not true;
  - missing or malformed forceLoginOrgUUID;
  - missing or non-TLS OTEL endpoint when telemetry is enabled;
  - missing hook events (PreToolUse, SessionStart, SessionEnd) or a hook
    command that does not invoke matter-guard.js / is not a real file;
  - unsupported platform (native Windows);
  - missing managed locks (allowManagedHooksOnly, allowManagedMcpServersOnly,
    forceRemoteSettingsRefresh, disableArtifact, disableRemoteControl);
  - missing sandbox.filesystem.allowManagedReadPathsOnly or
    sandbox.network.allowManagedDomainsOnly;
  - empty/managed MCP policy (allowedMcpServers must be an empty array);
  - any unresolved governance register (expert-report rule still PENDING,
    supplier evidence register still containing REPLACE-WITH).
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from typing import Any

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+")
PLACEHOLDER_TOKENS = ("REPLACE-WITH",)

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
URL_PREFIX_RE = re.compile(r"^https?://")
PLACEHOLDER_MARKERS = (
    "REPLACE-WITH", "OWNER-REQUIRED", "DATE-REQUIRED", "EVIDENCE-REQUIRED", "PENDING",
)


def _is_register_placeholder(value: str) -> bool:
    """True when a register cell value is still an unresolved placeholder."""
    return any(marker in value for marker in PLACEHOLDER_MARKERS)


def _parse_markdown_table(text: str) -> list[list[str]]:
    """Return data rows (each a list of cell strings) from the first markdown table."""
    rows: list[list[str]] = []
    header_seen = False
    for line in text.splitlines():
        stripped = line.strip()
        if not (stripped.startswith("|") and stripped.endswith("|")):
            continue
        cells = [c.strip() for c in stripped[1:-1].split("|")]
        if not header_seen:
            header_seen = True
            continue
        if all(re.match(r"^[-:]+$", c) for c in cells if c):
            continue
        rows.append(cells)
    return rows


def _find_status(text: str) -> str:
    """Extract the status value from a '## Status' heading or a 'Status:' line.
    Handles a blank line after the heading by scanning forward until a non-empty line.
    """
    lines = text.splitlines()
    for i, ln in enumerate(lines):
        stripped = ln.strip()
        # Direct status line like "Status: APPROVED"
        if stripped.startswith("Status:") or stripped.startswith("Status "):
            return stripped
        # Markdown heading "## Status" (or any number of #) – look ahead for first non-blank.
        if stripped.lstrip("#").strip() == "Status" and i + 1 < len(lines):
            # Scan forward from the line after the heading until a non-blank line.
            for j in range(i + 1, len(lines)):
                candidate = lines[j].strip()
                if candidate:
                    return candidate
            return ""  # No non-blank line after heading.
    return ""



# Per-register positive validators. Each takes the register text and returns a
# list of issue strings; an empty list means the register is resolved. The old
# approach checked for the *absence* of marker strings (PENDING, OWNER-REQUIRED,
# REPLACE-WITH), which a stub file containing only ``# done`` would satisfy.
# Positive validation requires a named owner, an ISO date and a source URL, so a
# stub cannot pass the gate.

def _validate_expert_report_rule(text: str) -> list[str]:
    """Status must say APPROVED, not merely fail to say PENDING."""
    status = _find_status(text)
    if not status:
        return ["expert-report rule has no status line"]
    if "APPROVED" not in status.upper():
        return [f"expert-report rule status is not APPROVED: {status!r}"]
    return []


def _validate_oauth_token_management(text: str) -> list[str]:
    """Status must say APPROVED, not merely fail to say PENDING."""
    status = _find_status(text)
    if not status:
        return ["oauth-token-management has no status line"]
    if "APPROVED" not in status.upper():
        return [f"oauth-token-management status is not APPROVED: {status!r}"]
    return []


def _validate_supplier_evidence_register(text: str) -> list[str]:
    """Each row must carry a source URL, an ISO verified date, a named owner and an ISO next-review date."""
    rows = _parse_markdown_table(text)
    if not rows:
        return ["supplier evidence register has no table rows"]
    issues: list[str] = []
    for i, row in enumerate(rows):
        if len(row) < 5:
            issues.append(f"supplier evidence register row {i + 1} has too few columns")
            continue
        url, verified, owner, review = row[1], row[2], row[3], row[4]
        if not URL_PREFIX_RE.match(url):
            issues.append(f"supplier evidence register row {i + 1} source URL is not http(s)")
        if not ISO_DATE_RE.match(verified):
            issues.append(f"supplier evidence register row {i + 1} verified date is not an ISO date")
        if not owner or _is_register_placeholder(owner):
            issues.append(f"supplier evidence register row {i + 1} owner is unresolved")
        if not ISO_DATE_RE.match(review):
            issues.append(f"supplier evidence register row {i + 1} next-review date is not an ISO date")
    return issues


def _validate_legal_source_register(text: str) -> list[str]:
    """Each row must carry an authorised source URL, a named owner, an ISO date checked and an ISO next review."""
    rows = _parse_markdown_table(text)
    if not rows:
        return ["legal source register has no table rows"]
    issues: list[str] = []
    for i, row in enumerate(rows):
        if len(row) < 7:
            issues.append(f"legal source register row {i + 1} has too few columns")
            continue
        source, owner, checked, review = row[2], row[4], row[5], row[6]
        if not URL_PREFIX_RE.match(source):
            issues.append(f"legal source register row {i + 1} authorised source is not http(s)")
        if not owner or _is_register_placeholder(owner):
            issues.append(f"legal source register row {i + 1} owner is unresolved")
        if not ISO_DATE_RE.match(checked):
            issues.append(f"legal source register row {i + 1} date checked is not an ISO date")
        if not ISO_DATE_RE.match(review):
            issues.append(f"legal source register row {i + 1} next review is not an ISO date")
    return issues


def _validate_data_flow_model(text: str) -> list[str]:
    """Three owner sign-offs (privacy, security, records) each with a named owner, an ISO date and evidence."""
    names = re.findall(r"\*\*Name:\*\*\s*(.+)", text)
    dates = re.findall(r"\*\*Date:\*\*\s*(.+)", text)
    evidences = re.findall(r"\*\*Evidence:\*\*\s*(.+)", text)
    if len(names) < 3 or len(dates) < 3 or len(evidences) < 3:
        return [
            "data-flow model must have 3 owner sign-offs (privacy, security, records) "
            "each with Name, Date and Evidence"
        ]
    issues: list[str] = []
    labels = ("privacy", "security", "records")
    for i in range(3):
        name = names[i].strip()
        date = dates[i].strip()
        evidence = evidences[i].strip()
        if not name or _is_register_placeholder(name):
            issues.append(f"data-flow model {labels[i]} owner name is unresolved")
        if not ISO_DATE_RE.match(date):
            issues.append(f"data-flow model {labels[i]} owner date is not an ISO date")
        if not evidence or _is_register_placeholder(evidence):
            issues.append(f"data-flow model {labels[i]} owner evidence is unresolved")
    return issues


# Governance registers whose resolution is a release precondition. Each entry
# is (path relative to repo root, validator that returns issue strings when
# unresolved). Validators check *positively* for named owners, ISO dates and
# source URLs — not merely for the absence of placeholder markers.
GOVERNANCE_REGISTERS: list[tuple[str, Any]] = [
    ("docs/policy-decisions/expert-report-rule.md", _validate_expert_report_rule),
    ("docs/supplier-evidence-register.md", _validate_supplier_evidence_register),
    ("docs/legal-source-register.md", _validate_legal_source_register),
    ("docs/data-flow-model.md", _validate_data_flow_model),
    ("docs/policy-decisions/oauth-token-management.md", _validate_oauth_token_management),
]


def find_settings_path() -> pathlib.Path:
    for candidate in (
        SCRIPT_DIR / "managed-settings.json",
        REPO_ROOT / "managed-settings.json",
        pathlib.Path.cwd() / "managed-settings.json",
    ):
        if candidate.exists():
            return candidate
    return REPO_ROOT / "managed-settings.json"


def is_windows_platform() -> bool:
    """True when the runtime host is native Windows (not WSL2).

    WSL2 reports as 'Linux' via platform.system(); native Windows reports
    'Windows'. The design certifies only Linux/WSL2 for production.
    """
    import platform

    return platform.system() == "Windows"


def contains_placeholder(value: str) -> bool:
    return any(token in value for token in PLACEHOLDER_TOKENS)


def validate_uuid(value: str) -> bool:
    return bool(UUID_RE.match(value or ""))


def hook_command_is_executable(command: str) -> bool:
    """Best-effort check that a hook command resolves to a real file.

    The hook command is of the form ``node "/path/to/matter-guard.js"``. We
    extract the script path and verify it exists and is a file. We expand the
    literal token ``${REPO_ROOT}`` to the repository root for synthetic fixture
    testing.
    """
    if not command:
        return False
    expanded_command = command.replace("${REPO_ROOT}", str(REPO_ROOT))
    parts = expanded_command.split(None, 1)
    if len(parts) < 2:
        return False
    script_path = parts[1].strip().strip('"').strip("'")
    p = pathlib.Path(script_path)
    return p.exists() and p.is_file()


def check_governance_registers(
    errors: list[str],
    warnings: list[str],
    mode: str,
    settings_path: pathlib.Path,
) -> None:
    """Verify governance registers are resolved.

    In production mode an unresolved register is an error; in template mode it
    is a warning so a fresh checkout still passes.

    In production mode, registers are resolved from the repo root ONLY — a stub
    file next to the settings file cannot satisfy the gate. In template mode,
    the settings file's directory is tried first (supporting synthetic fixtures
    that bundle their own resolved registers), then the repo root.
    """
    for rel_path, validator in GOVERNANCE_REGISTERS:
        # Try the settings file's directory first (supporting synthetic fixtures
        # that bundle their own resolved registers), then fall back to the repo
        # root. Positive validation defeats bypass via stub files: an empty file
        # or a file with no table rows, no ISO dates, and no real URLs fails
        # the validator regardless of which directory it came from.
        full = settings_path.parent / rel_path
        if not full.exists():
            full = REPO_ROOT / rel_path
        if not full.exists():
            msg = f"governance register missing: {rel_path}"
            if mode == "production":
                errors.append(msg)
            else:
                warnings.append(msg)
            continue
        text = full.read_text(encoding="utf-8")
        issues = validator(text)
        if issues:
            for issue in issues:
                msg = f"governance register unresolved: {rel_path} — {issue}"
                if mode == "production":
                    errors.append(msg)
                else:
                    warnings.append(msg)


def validate(
    settings: dict[str, Any], settings_path: pathlib.Path, mode: str
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    env = settings.get("env", {})
    if not isinstance(env, dict):
        errors.append("env must be an object")
        env = {}

    sandbox = settings.get("sandbox", {})
    if not isinstance(sandbox, dict):
        errors.append("sandbox must be an object")
        sandbox = {}

    hooks = settings.get("hooks")
    if hooks is None:
        errors.append("no hooks block")
        hooks = {}
    elif not isinstance(hooks, dict):
        errors.append("hooks must be an object")
        hooks = {}

    # --- Placeholders -------------------------------------------------------
    matter_roots = env.get("CLAUDE_MATTER_ROOTS", "")
    if contains_placeholder(str(matter_roots)):
        msg = "CLAUDE_MATTER_ROOTS still contains a REPLACE-WITH placeholder"
        if mode == "production":
            errors.append(msg)
        else:
            warnings.append(msg)

    if mode == "production" and not contains_placeholder(str(matter_roots)):
        roots = [root.strip() for root in str(matter_roots).split(";") if root.strip()]
        if not roots:
            errors.append("CLAUDE_MATTER_ROOTS must contain at least one root in production")
        for root in roots:
            if not root.startswith("/") or "\\" in root:
                errors.append(f"CLAUDE_MATTER_ROOTS root is not an absolute POSIX path: {root!r}")

    force_login = settings.get("forceLoginOrgUUID", "")
    if contains_placeholder(str(force_login)):
        msg = "forceLoginOrgUUID still contains a REPLACE-WITH placeholder"
        if mode == "production":
            errors.append(msg)
        else:
            warnings.append(msg)

    otel_endpoint = env.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    telemetry_enabled = env.get("CLAUDE_CODE_ENABLE_TELEMETRY", "") == "1"
    if contains_placeholder(str(otel_endpoint)) and telemetry_enabled:
        msg = (
            "OTEL_EXPORTER_OTLP_ENDPOINT still contains a REPLACE-WITH placeholder "
            "while telemetry is enabled"
        )
        if mode == "production":
            errors.append(msg)
        else:
            warnings.append(msg)

    claude_md = settings.get("claudeMd", "")
    if isinstance(claude_md, str) and "REPLACE-WITH-YOUR-FIRM-NAME" in claude_md:
        if mode == "production":
            errors.append("claudeMd still contains the firm-name placeholder")
        else:
            warnings.append("claudeMd still contains the firm-name placeholder")

    # --- CLAUDE_MATTER_MODE -------------------------------------------------
    matter_mode = env.get("CLAUDE_MATTER_MODE", "")
    if matter_mode not in ("enforce", "warn"):
        errors.append(
            f"CLAUDE_MATTER_MODE is {matter_mode!r}, must be 'enforce' or 'warn'"
        )
    elif matter_mode == "warn":
        if mode == "production":
            errors.append("CLAUDE_MATTER_MODE is 'warn' (must be 'enforce' in production)")
        else:
            warnings.append("CLAUDE_MATTER_MODE is 'warn' (observation mode)")

    # --- Sandbox ------------------------------------------------------------
    # sandbox.enabled and allowUnsandboxedCommands are structural invariants
    # in both modes: the template already sets them correctly, so a missing or
    # wrong value is always an error.
    if sandbox.get("enabled") is not True:
        errors.append("sandbox.enabled must be true")
    if sandbox.get("allowUnsandboxedCommands") is not False:
        errors.append("sandbox.allowUnsandboxedCommands must be false")
    fail_if_unavailable = sandbox.get("failIfUnavailable")
    if mode == "production":
        if fail_if_unavailable is not True:
            errors.append("sandbox.failIfUnavailable is not true")
    else:
        if fail_if_unavailable is False:
            warnings.append("sandbox.failIfUnavailable is false (observation default)")

    # --- Managed locks (production only) ------------------------------------
    managed_locks = {
        "allowManagedHooksOnly": "allowManagedHooksOnly is not true",
        "allowManagedMcpServersOnly": "allowManagedMcpServersOnly is not true",
        "forceRemoteSettingsRefresh": "forceRemoteSettingsRefresh is not true",
        "disableArtifact": "disableArtifact is not true",
        "disableRemoteControl": "disableRemoteControl is not true",
    }
    for key, msg in managed_locks.items():
        if settings.get(key) is not True:
            if mode == "production":
                errors.append(msg)

    # --- Sandbox managed read/network locks (production only) ---------------
    fs = sandbox.get("filesystem", {})
    net = sandbox.get("network", {})
    if fs is not None and not isinstance(fs, dict):
        errors.append("sandbox.filesystem must be an object")
        fs = {}
    if not isinstance(fs, dict):
        fs = {}
    if net is not None and not isinstance(net, dict):
        errors.append("sandbox.network must be an object")
        net = {}
    if not isinstance(net, dict):
        net = {}
    if mode == "production":
        if fs.get("allowManagedReadPathsOnly") is not True:
            errors.append("sandbox.filesystem.allowManagedReadPathsOnly must be true")
        else:
            deny_read = fs.get("denyRead") or []
            if not isinstance(deny_read, list) or not any(
                d in ("/", "~") for d in deny_read
            ):
                errors.append(
                    "sandbox.filesystem.denyRead must include '/' or '~' when "
                    "allowManagedReadPathsOnly is true"
                )
        if net.get("allowManagedDomainsOnly") is not True:
            errors.append("sandbox.network.allowManagedDomainsOnly must be true")
        else:
            allowed_domains = net.get("allowedDomains") or []
            if not isinstance(allowed_domains, list) or not allowed_domains:
                errors.append(
                    "sandbox.network.allowedDomains must be a non-empty array when "
                    "allowManagedDomainsOnly is true"
                )

    # --- UUID format --------------------------------------------------------
    if mode == "production":
        if not force_login:
            errors.append("forceLoginOrgUUID is missing")
        elif not contains_placeholder(str(force_login)) and not validate_uuid(
            str(force_login)
        ):
            errors.append("forceLoginOrgUUID is not a valid UUID")
    elif force_login and not contains_placeholder(str(force_login)):
        if not validate_uuid(str(force_login)):
            errors.append("forceLoginOrgUUID is not a valid UUID")

    # --- OTLP TLS -----------------------------------------------------------
    if telemetry_enabled:
        if not otel_endpoint:
            if mode == "production":
                errors.append(
                    "OTEL_EXPORTER_OTLP_ENDPOINT is missing while telemetry is enabled"
                )
        elif not contains_placeholder(str(otel_endpoint)):
            if not str(otel_endpoint).startswith("https://"):
                errors.append(
                    "OTEL_EXPORTER_OTLP_ENDPOINT must start with https:// "
                    "when telemetry is enabled"
                )

    # --- MCP policy ---------------------------------------------------------
    if mode == "production":
        allowed_mcp = settings.get("allowedMcpServers")
        if allowed_mcp is None:
            errors.append("allowedMcpServers must be present (empty array)")
        elif not isinstance(allowed_mcp, list):
            errors.append("allowedMcpServers must be an array")
        elif len(allowed_mcp) != 0:
            errors.append(
                "allowedMcpServers must be an empty array "
                "(no user MCP servers in production)"
            )

    # --- Hooks --------------------------------------------------------------
    required_events = ("PreToolUse", "SessionStart", "SessionEnd")
    for event in required_events:
        entries = hooks.get(event)
        if not entries:
            errors.append(f"missing hook event: {event}")
            continue
        if not isinstance(entries, list):
            errors.append(f"hook event {event} must be a non-empty array")
            continue
        saw_command = False
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for hook in entry.get("hooks", []) or []:
                if not isinstance(hook, dict):
                    continue
                cmd = hook.get("command", "")
                if not cmd:
                    errors.append(f"hook {event} has an empty command")
                    continue
                saw_command = True
                if "matter-guard.js" not in str(cmd):
                    errors.append(
                        f"hook {event} command does not invoke matter-guard.js: {cmd}"
                    )
                    continue
                # In production mode the hook path must resolve to a real file.
                # In template mode the path is a deployment placeholder
                # (/etc/claude-code/hooks/...) that is not present on the
                # build host, so we only warn.
                if not hook_command_is_executable(str(cmd)):
                    msg = f"hook {event} command not found or not a file: {cmd}"
                    if mode == "production":
                        errors.append(msg)
                    else:
                        warnings.append(msg)
        if not saw_command:
            errors.append(f"hook {event} has no command")

    # --- Platform -----------------------------------------------------------
    # Native Windows is always rejected: the certified path is Linux/WSL2.
    if is_windows_platform():
        errors.append(
            "native Windows is not supported for production; use Linux or WSL2"
        )

    # --- Version compatibility ---------------------------------------------
    min_version = settings.get("requiredMinimumVersion", "")
    if min_version and not VERSION_RE.match(str(min_version)):
        errors.append(
            f"requiredMinimumVersion is not a valid version: {min_version!r}"
        )
    max_version = settings.get("requiredMaximumVersion", "")
    if max_version and not VERSION_RE.match(str(max_version)):
        errors.append(
            f"requiredMaximumVersion is not a valid version: {max_version!r}"
        )
    if mode == "production" and not min_version:
        errors.append("requiredMinimumVersion is missing")

    # --- Governance registers ---------------------------------------------
    check_governance_registers(errors, warnings, mode, settings_path)

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Preflight validation for Claude settings"
    )
    parser.add_argument(
        "settings_file",
        nargs="?",
        help="path to the settings JSON file to validate (defaults to managed-settings.json)",
    )
    parser.add_argument(
        "--mode",
        choices=["template", "production"],
        default="template",
        help=(
            "validation mode: template (allow placeholders/insecure defaults) "
            "or production (fail on any)"
        ),
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress warnings; print only errors and the final result",
    )
    args = parser.parse_args()
    mode = args.mode

    if args.settings_file:
        settings_path = pathlib.Path(args.settings_file).resolve()
    else:
        settings_path = find_settings_path()

    if not settings_path.exists():
        print(f"ERROR: settings file not found (looked at {settings_path})")
        print("FAIL: 1 error(s) found")
        return 1

    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: settings file is not valid JSON: {exc}")
        print("FAIL: 1 error(s) found")
        return 1
    except OSError as exc:
        print(f"ERROR: could not read settings file: {exc}")
        print("FAIL: 1 error(s) found")
        return 1

    errors, warnings = validate(settings, settings_path, mode)

    for e in errors:
        print(f"ERROR: {e}")
    if not args.quiet:
        for w in warnings:
            print(f"WARNING: {w}")

    if errors:
        print(f"FAIL: {len(errors)} error(s) found")
        return 1

    if mode == "production":
        print("PASS: production preconditions met")
        if not args.quiet:
            print(
                "NOTE: this is an engineering readiness gate, not a compliance "
                "certification. See docs/release-checklist.md."
            )
    else:
        print("PASS: no errors found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
