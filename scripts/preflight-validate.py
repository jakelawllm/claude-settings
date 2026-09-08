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
import datetime as dt
import hashlib
import json
import pathlib
import platform
import re
import subprocess
import sys
from typing import Any
from urllib.parse import urlsplit
from release_validation import (VERSION_RE, valid_date, valid_https_endpoint, valid_posix_path,
                                validate_sandbox, validate_matter_scope, hook_script, version_tuple)

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
PLACEHOLDER_TOKENS = ("REPLACE-WITH",)

PLACEHOLDER_MARKERS = (
    "REPLACE-WITH",
    "OWNER-REQUIRED",
    "DATE-REQUIRED",
    "EVIDENCE-REQUIRED",
    "EVIDENCE-REFERENCE-REQUIRED",
    "PENDING",
)


def _is_register_placeholder(value: str) -> bool:
    """True when a register cell value is still an unresolved placeholder."""
    return any(marker in value.upper() for marker in PLACEHOLDER_MARKERS)


def _valid_source_url(value: str) -> bool:
    if _is_register_placeholder(value) or any(c.isspace() or c == "\\" for c in value):
        return False
    try:
        parsed = urlsplit(value)
        return bool(parsed.scheme in ("http", "https") and parsed.hostname
                    and not parsed.username and not parsed.password and parsed.port != 0)
    except ValueError:
        return False


def _parse_markdown_table(text: str) -> list[list[str]]:
    """Return data rows (each a list of cell strings) from the first markdown table."""
    rows: list[list[str]] = []
    header_seen = False
    for line in text.splitlines():
        stripped = line.strip()
        if not (stripped.startswith("|") and stripped.endswith("|")):
            if rows:
                break
            continue
        cells = [c.strip() for c in stripped[1:-1].split("|")]
        if not header_seen:
            header_seen = True
            continue
        if all(re.match(r"^[-:]+$", c) for c in cells if c):
            continue
        rows.append(cells)
    return rows


def _status_value(line: str) -> str:
    stripped = line.strip()
    direct = re.match(r"(?i)^status\s*:\s*(.*)$", stripped)
    return direct.group(1).strip() if direct else stripped


def _find_status(text: str) -> str:
    """Extract the status value from a '## Status' heading or a 'Status:' line.
    Handles a blank line after the heading by scanning forward until a non-empty line.
    """
    lines = text.splitlines()
    for i, ln in enumerate(lines):
        stripped = ln.strip()
        # Direct status line like "Status: APPROVED".
        if re.match(r"(?i)^status\s*:", stripped):
            return _status_value(stripped)
        # Markdown heading "## Status" (or any number of #) – look ahead for first non-blank.
        if stripped.lstrip("#").strip() == "Status" and i + 1 < len(lines):
            # Scan forward from the line after the heading until a non-blank line.
            for j in range(i + 1, len(lines)):
                candidate = lines[j].strip()
                if candidate:
                    return _status_value(candidate)
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
    # Require a positive leading APPROVED word. Substring checks would accept
    # "NOT APPROVED" and "UNAPPROVED".
    if not re.match(r"(?i)^\s*APPROVED\b", status):
        return [f"expert-report rule status is not APPROVED: {status!r}"]
    return []


def _find_decision_field(text: str, label: str) -> str:
    """Return a decision-record bullet value by label."""
    escaped = re.escape(label)
    pattern = re.compile(rf"^-[ \t]+(?:\*\*{escaped}:\*\*|\*\*{escaped}\*\*:|{escaped}:)[ \t]*(.+)$", re.MULTILINE)
    matches = pattern.findall(text)
    return matches[0].strip() if len(matches) == 1 else ""


def _utc_today() -> dt.date:
    return dt.datetime.now(dt.timezone.utc).date()


def _completed_date_issues(value: str, label: str, assessment_date: dt.date) -> list[str]:
    if valid_date(value) and dt.date.fromisoformat(value) > assessment_date:
        return [f"{label} is in the future (assessed on {assessment_date.isoformat()} UTC)"]
    return []


def _review_date_issues(completed: str, due: str, label: str, assessment_date: dt.date) -> list[str]:
    """A due date remains valid through that UTC calendar day."""
    issues = _completed_date_issues(completed, f"{label} completed date", assessment_date)
    if valid_date(due):
        due_date = dt.date.fromisoformat(due)
        if due_date < assessment_date:
            issues.append(f"{label} is overdue (due {due}, assessed on {assessment_date.isoformat()} UTC)")
        if valid_date(completed) and due_date < dt.date.fromisoformat(completed):
            issues.append(f"{label} due date precedes its completed date")
    return issues


def _validate_disabled_workflow(text: str, assessment_date: dt.date) -> list[str]:
    """Validate a current, explicit remote-disablement observation.

    This verifies the record and local artifact, not live GitHub state. Operators
    must re-query the named API before recording today's observation. Missing
    credentials or an unset enable variable never satisfy this disposition.
    """
    issues: list[str] = []
    required_fields = ("Workflow state", "Workflow path", "Workflow ID", "Repository",
                       "Workflow SHA-256 (LF)", "Evidence source", "Observed by", "Verified date")
    fields = {label: _find_decision_field(text, label) for label in required_fields}
    for label, value in fields.items():
        if not value or _is_register_placeholder(value):
            issues.append(f"disabled workflow field {label!r} is unresolved")
    if fields["Workflow state"] != "disabled_manually":
        issues.append("disabled workflow requires an observed disabled_manually state")
    if fields["Workflow path"] != ".github/workflows/claude.yml":
        issues.append("disabled workflow path must be .github/workflows/claude.yml")
    if not re.fullmatch(r"[1-9][0-9]*", fields["Workflow ID"]):
        issues.append("disabled workflow ID must be a positive integer")
    if fields["Verified date"] != assessment_date.isoformat():
        issues.append("disabled workflow observation must be rechecked on the current UTC assessment date")
    try:
        remote = subprocess.run(["git", "config", "--get", "remote.origin.url"], cwd=REPO_ROOT,
                                capture_output=True, text=True, check=True, timeout=5).stdout.strip()
        match = re.fullmatch(r"(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)([^/]+/[^/]+?)(?:\.git)?", remote)
        if not match or fields["Repository"] != match.group(1):
            issues.append("disabled workflow repository does not match this checkout's GitHub origin")
    except (OSError, subprocess.SubprocessError):
        issues.append("disabled workflow repository identity could not be checked against git origin")
    expected_source = f"https://api.github.com/repos/{fields['Repository']}/actions/workflows/claude.yml"
    if fields["Evidence source"] != expected_source:
        issues.append("disabled workflow evidence source must identify this workflow's GitHub API endpoint")
    try:
        workflow = (REPO_ROOT / ".github/workflows/claude.yml").read_bytes().replace(b"\r\n", b"\n")
        if fields["Workflow SHA-256 (LF)"] != hashlib.sha256(workflow).hexdigest():
            issues.append("disabled workflow hash does not match the current workflow; repeat the disablement review")
    except OSError:
        issues.append("disabled workflow artifact is unreadable")
    return issues


def _validate_oauth_token_management(text: str, mode: str, assessment_date: dt.date | None = None) -> list[str]:
    """Static-token exceptions must be scope-aware and positively recorded."""
    current = re.findall(r"^### Current workflow disposition\s*\n(.*?)(?=^#{1,3} |\Z)", text, re.MULTILINE | re.DOTALL)
    if len(current) > 1:
        return ["oauth-token-management current workflow disposition is duplicated"]
    if current:
        text = current[0]
        if _find_status(text) == "DISABLED":
            return _validate_disabled_workflow(text, assessment_date or _utc_today())
    status = _find_status(text)
    if not status:
        return ["oauth-token-management has no status line"]
    # Require a positive leading APPROVED word. Substring checks would accept
    # "NOT APPROVED" and "UNAPPROVED".
    if not re.match(r"(?i)^\s*APPROVED\b", status):
        return [f"oauth-token-management status is not APPROVED: {status!r}"]
    if mode == "production" and "INTERNAL BETA" in status.upper():
        return [f"oauth-token-management status is not approved for production: {status!r}"]

    required_fields = (
        "Decision",
        "Decided by",
        "Date",
        "Rationale",
        "Token owner",
        "Storage location",
        "Minimum permissions",
        "Rotation interval",
        "Last rotated",
        "Next rotation due",
        "Emergency revocation procedure",
        "Monitoring owner",
        "Migration trigger",
    )
    issues: list[str] = []
    for field in required_fields:
        value = _find_decision_field(text, field)
        if not value or _is_register_placeholder(value):
            issues.append(f"oauth-token-management field {field!r} is unresolved")

    if mode == "production":
        assessment_date = assessment_date or _utc_today()
        for field in ("Date", "Last rotated", "Next rotation due"):
            value = _find_decision_field(text, field)
            if value and not valid_date(value):
                issues.append(f"oauth-token-management field {field!r} has no ISO date")
        issues.extend(_completed_date_issues(_find_decision_field(text, "Date"), "oauth-token-management approval date", assessment_date))
        issues.extend(_review_date_issues(
            _find_decision_field(text, "Last rotated"), _find_decision_field(text, "Next rotation due"),
            "oauth-token-management rotation", assessment_date,
        ))
    return issues


def _validate_supplier_evidence_register(text: str, assessment_date: dt.date | None = None) -> list[str]:
    """Each row must carry a source URL, an ISO verified date, a named owner and an ISO next-review date."""
    rows = _parse_markdown_table(text)
    if not rows:
        return ["supplier evidence register has no table rows"]
    issues: list[str] = []
    assessment_date = assessment_date or _utc_today()
    required_claims = (
        "Inputs and outputs are not used to train any model",
        "Inputs and outputs are not made publicly available",
        "Supplier retention for the selected product/account is recorded separately from local cleanupPeriodDays",
        "Managed telemetry content gates are explicitly disabled and deployed collector output is observed",
    )
    for claim in required_claims:
        if sum(row[0] == claim for row in rows) != 1:
            issues.append(f"supplier evidence register must contain exactly one entry for: {claim}")
    for i, row in enumerate(rows):
        if len(row) < 5:
            issues.append(f"supplier evidence register row {i + 1} has too few columns")
            continue
        url, verified, owner, review = row[1], row[2], row[3], row[4]
        if not _valid_source_url(url):
            issues.append(f"supplier evidence register row {i + 1} source URL is not http(s)")
        if not valid_date(verified):
            issues.append(f"supplier evidence register row {i + 1} verified date is not an ISO date")
        if not owner or _is_register_placeholder(owner):
            issues.append(f"supplier evidence register row {i + 1} owner is unresolved")
        if not valid_date(review):
            issues.append(f"supplier evidence register row {i + 1} next-review date is not an ISO date")
        issues.extend(_review_date_issues(verified, review, f"supplier evidence register row {i + 1} review", assessment_date))
    return issues


def _validate_legal_source_register(text: str, assessment_date: dt.date | None = None) -> list[str]:
    """Each row must carry an authorised source URL, a named owner, an ISO date checked and an ISO next review."""
    rows = _parse_markdown_table(text)
    if not rows:
        return ["legal source register has no table rows"]
    issues: list[str] = []
    assessment_date = assessment_date or _utc_today()
    for instrument in ("SC Gen 23", "Federal Court", "Federal Circuit and Family Court", "Solicitors' Conduct Rules"):
        if sum(instrument in row[0] for row in rows) != 1:
            issues.append(f"legal source register must contain exactly one entry for: {instrument}")
    for i, row in enumerate(rows):
        if len(row) < 7:
            issues.append(f"legal source register row {i + 1} has too few columns")
            continue
        source, interpretation, owner, checked, review = row[2], row[3], row[4], row[5], row[6]
        if not _valid_source_url(source):
            issues.append(f"legal source register row {i + 1} authorised source is not http(s)")
        if not interpretation or _is_register_placeholder(interpretation) or re.match(r"(?i)^(?:NOT APPROVED|UNAPPROVED|REJECTED)\b", interpretation):
            issues.append(f"legal source register row {i + 1} approved interpretation is unresolved")
        if not owner or _is_register_placeholder(owner):
            issues.append(f"legal source register row {i + 1} owner is unresolved")
        if not valid_date(checked):
            issues.append(f"legal source register row {i + 1} date checked is not an ISO date")
        if not valid_date(review):
            issues.append(f"legal source register row {i + 1} next review is not an ISO date")
        issues.extend(_review_date_issues(checked, review, f"legal source register row {i + 1} review", assessment_date))
    return issues


def _validate_data_flow_model(text: str, assessment_date: dt.date | None = None) -> list[str]:
    """Three owner sign-offs (privacy, security, records) each with a named owner, an ISO date and evidence."""
    names = re.findall(r"\*\*Name:\*\*\s*(.+)", text)
    dates = re.findall(r"\*\*Date:\*\*\s*(.+)", text)
    evidences = re.findall(r"\*\*Evidence:\*\*\s*(.+)", text)
    if len(names) < 3 or len(dates) < 3 or len(evidences) < 3:
        return [
            (
                "data-flow model must have 3 owner sign-offs "
                "(privacy, security, records) each with Name, Date and Evidence"
            )
        ]
    issues: list[str] = []
    assessment_date = assessment_date or _utc_today()
    labels = ("privacy", "security", "records")
    for i in range(3):
        name = names[i].strip()
        date = dates[i].strip()
        evidence = evidences[i].strip()
        if not name or _is_register_placeholder(name):
            issues.append(f"data-flow model {labels[i]} owner name is unresolved")
        if not valid_date(date):
            issues.append(f"data-flow model {labels[i]} owner date is not an ISO date")
        issues.extend(_completed_date_issues(date, f"data-flow model {labels[i]} owner date", assessment_date))
        if not evidence or _is_register_placeholder(evidence):
            issues.append(f"data-flow model {labels[i]} owner evidence is unresolved")
    return issues


EXPECTED_OPERATIONAL_GATES = (
    "`claude doctor` on each supported platform",
    "`/status` in a real session",
    "Live E2E (`CLAUDE_E2E=1 node tests/e2e.test.js`)",
    "Cross-matter refusal smoke test",
    "Sandbox fail-closed check",
    "`SessionEnd` transcript filing check",
    "Native Windows platform exclusion",
    "Manifest signature verification",
    "Version compatibility review",
    "OS-isolation acceptance",
    "Records-service confirmation",
    "Independent security review",
)


def _validate_operational_evidence_register(text: str, assessment_date: dt.date | None = None) -> list[str]:
    """Every operational gate must have an owner, ISO date and evidence reference."""
    rows = _parse_markdown_table(text)
    if not rows:
        return ["operational evidence register has no table rows"]

    issues: list[str] = []
    assessment_date = assessment_date or _utc_today()
    seen: set[str] = set()
    expected = set(EXPECTED_OPERATIONAL_GATES)
    for i, row in enumerate(rows):
        if len(row) < 6:
            issues.append(f"operational evidence register row {i + 1} has too few columns")
            continue
        gate, owner, date, evidence = row[0], row[3], row[4], row[5]
        if gate in seen:
            issues.append(f"operational evidence register gate {gate!r} is duplicated")
        seen.add(gate)
        if gate not in expected:
            issues.append(f"operational evidence register gate {gate!r} is unexpected")
        if not owner or _is_register_placeholder(owner):
            issues.append(f"operational evidence register row {i + 1} owner is unresolved")
        if not valid_date(date):
            issues.append(f"operational evidence register row {i + 1} date is not an ISO date")
        issues.extend(_completed_date_issues(date, f"operational evidence register row {i + 1} date", assessment_date))
        if not evidence or _is_register_placeholder(evidence):
            issues.append(f"operational evidence register row {i + 1} evidence reference is unresolved")

    for gate in EXPECTED_OPERATIONAL_GATES:
        if gate not in seen:
            issues.append(f"operational evidence register missing gate: {gate}")
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
    ("docs/operational-evidence-register.md", _validate_operational_evidence_register),
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
    return any(token in value.upper() for token in PLACEHOLDER_TOKENS)


def find_placeholders(value: Any, location: str = "settings") -> list[str]:
    if isinstance(value, dict):
        return [found for key, item in value.items() for found in find_placeholders(item, f"{location}.{key}")]
    if isinstance(value, list):
        return [found for i, item in enumerate(value) for found in find_placeholders(item, f"{location}[{i}]")]
    return [location] if isinstance(value, str) and contains_placeholder(value) else []


def validate_uuid(value: str) -> bool:
    return bool(UUID_RE.fullmatch(value or ""))


def hook_command_is_executable(command: str) -> bool:
    """Best-effort check that a hook command resolves to a real file.

    The hook command is of the form ``node "/path/to/matter-guard.js"``. We
    extract the script path and verify it exists and is a file. We expand the
    literal token ``${REPO_ROOT}`` to the repository root for synthetic fixture
    testing.
    """
    if not command:
        return False
    expanded_command = command.replace("${REPO_ROOT}", str(REPO_ROOT).replace("\\", "/"))
    script_path = hook_script(expanded_command)
    if script_path is None:
        return False
    p = pathlib.Path(script_path)
    return p.exists() and p.is_file()


def check_governance_registers(
    errors: list[str],
    warnings: list[str],
    mode: str,
    settings_path: pathlib.Path,
    evidence_root: pathlib.Path | None = None,
    assessment_date: dt.date | None = None,
) -> None:
    """Verify governance registers are resolved.

    In production mode an unresolved register is an error; in template mode it
    is a warning so a fresh checkout still passes.

    An explicitly supplied evidence directory is authoritative. Otherwise use
    the repository registers. Files beside settings must not silently shadow
    unresolved repository evidence.
    """
    assessment_date = assessment_date or _utc_today()
    for rel_path, validator in GOVERNANCE_REGISTERS:
        full = (evidence_root or REPO_ROOT) / rel_path
        if not full.exists():
            msg = f"governance register missing: {rel_path}"
            if mode == "production":
                errors.append(msg)
            else:
                warnings.append(msg)
            continue
        try:
            text = full.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            errors.append(f"governance register unreadable: {rel_path}")
            continue
        if rel_path == "docs/policy-decisions/oauth-token-management.md":
            issues = validator(text, mode, assessment_date)
        elif rel_path == "docs/policy-decisions/expert-report-rule.md":
            issues = validator(text)
        else:
            issues = validator(text, assessment_date)
        if issues:
            for issue in issues:
                msg = f"governance register unresolved: {rel_path} — {issue}"
                if mode == "production":
                    errors.append(msg)
                else:
                    warnings.append(msg)


def validate(
    settings: dict[str, Any], settings_path: pathlib.Path, mode: str,
    evidence_root: pathlib.Path | None = None,
    assessment_date: dt.date | None = None,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(settings, dict):
        return ["settings must be a JSON object"], []
    if mode == "production":
        for location in find_placeholders(settings):
            errors.append(f"unresolved REPLACE-WITH placeholder at {location}")
        if settings.get("disableAllHooks", False) is not False:
            errors.append("disableAllHooks must be false")
        permissions = settings.get("permissions")
        if not isinstance(permissions, dict) or not isinstance(permissions.get("deny"), list) or not permissions["deny"]:
            errors.append("permissions.deny must be a non-empty array")
        elif permissions.get("defaultMode") in ("bypassPermissions", "dontAsk"):
            errors.append("permissions.defaultMode must not bypass permission prompts")

    env = settings.get("env", {})
    if not isinstance(env, dict):
        errors.append("env must be an object")
        env = {}
    if any(not isinstance(value, str) for value in env.values()):
        errors.append("env values must be strings")

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
            if not valid_posix_path(root):
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
        errors.extend(validate_sandbox(sandbox))
        if env.get("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB") != "1":
            errors.append("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB must be '1'")
        if not errors:
            errors.extend(validate_matter_scope(sandbox, [r.strip() for r in str(matter_roots).split(";") if r.strip()]))
        for key in ("OTEL_LOG_USER_PROMPTS", "OTEL_LOG_ASSISTANT_RESPONSES", "OTEL_LOG_TOOL_DETAILS", "OTEL_LOG_TOOL_CONTENT", "OTEL_LOG_RAW_API_BODIES"):
            if env.get(key) != "0":
                errors.append(f"{key} must explicitly be '0' to prevent inherited content logging")
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
        if mode == "production" and settings.get(key) is not True:
            errors.append(msg)

    # --- UUID format --------------------------------------------------------
    if mode == "production":
        if not force_login:
            errors.append("forceLoginOrgUUID is missing")
        elif not contains_placeholder(str(force_login)) and not validate_uuid(
            str(force_login)
        ):
            errors.append("forceLoginOrgUUID is not a valid UUID")
    elif (
        force_login
        and not contains_placeholder(str(force_login))
        and not validate_uuid(str(force_login))
    ):
        errors.append("forceLoginOrgUUID is not a valid UUID")

    # --- OTLP TLS -----------------------------------------------------------
    if telemetry_enabled:
        if not otel_endpoint:
            if mode == "production":
                errors.append(
                    "OTEL_EXPORTER_OTLP_ENDPOINT is missing while telemetry is enabled"
                )
        elif not contains_placeholder(str(otel_endpoint)) and not valid_https_endpoint(otel_endpoint):
            errors.append(
                "OTEL_EXPORTER_OTLP_ENDPOINT must start with https:// "
                "when telemetry is enabled"
            )
    elif mode == "production":
        warnings.append("telemetry is disabled; record the metadata gap in Schedules 1 and 8")

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
                errors.append(f"hook {event} entry must be an object")
                continue
            if (event == "PreToolUse" and entry.get("matcher") != "*") or (event != "PreToolUse" and entry.get("matcher", "*") not in ("*", "")):
                errors.append(f"hook {event} must match all events")
            nested = entry.get("hooks")
            if not isinstance(nested, list) or not nested:
                errors.append(f"hook {event} hooks must be a non-empty array")
                continue
            for hook in nested:
                if not isinstance(hook, dict):
                    errors.append(f"hook {event} command entry must be an object")
                    continue
                if hook.get("type") != "command" or hook.get("async", False) is not False or hook.get("asyncRewake", False) is not False:
                    errors.append(f"hook {event} must be a synchronous command hook")
                cmd = hook.get("command", "")
                if not cmd:
                    errors.append(f"hook {event} has an empty command")
                    continue
                saw_command = True
                expanded = str(cmd).replace("${REPO_ROOT}", str(REPO_ROOT).replace("\\", "/"))
                if hook_script(expanded) is None:
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
    # Native Windows cannot approve production deployment; static template validation is portable.
    if mode == "production" and is_windows_platform():
        errors.append(
            "native Windows is not supported for production; use Linux or WSL2"
        )
    elif mode == "production" and platform.system() != "Linux":
        errors.append("production requires a Linux/WSL2 target; this host is not a supported isolation path")

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
    if mode == "production" and not max_version:
        errors.append("requiredMaximumVersion is missing")
    if VERSION_RE.fullmatch(str(min_version)) and VERSION_RE.fullmatch(str(max_version)):
        if version_tuple(str(min_version)) > version_tuple(str(max_version)):
            errors.append("requiredMinimumVersion exceeds requiredMaximumVersion")
        if mode == "production" and version_tuple(str(min_version)) < (2, 1, 251):
            errors.append("requiredMinimumVersion must be at least 2.1.251 for managed telemetry endpoint protection")

    # --- Governance registers ---------------------------------------------
    check_governance_registers(errors, warnings, mode, settings_path, evidence_root, assessment_date)

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
    parser.add_argument("--evidence-root", type=pathlib.Path,
                        help="explicit approved evidence bundle root containing docs/ (default repository root)")
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
    except (json.JSONDecodeError, UnicodeError) as exc:
        print(f"ERROR: settings file is not valid JSON: {exc}")
        print("FAIL: 1 error(s) found")
        return 1
    except OSError as exc:
        print(f"ERROR: could not read settings file: {exc}")
        print("FAIL: 1 error(s) found")
        return 1

    errors, warnings = validate(settings, settings_path, mode, args.evidence_root)

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
