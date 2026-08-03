"""Render a production managed settings file from the deployment template.

    python3 scripts/render-production-settings.py \
        --firm-name "Example Legal" \
        --org-uuid 11111111-2222-3333-4444-555555555555 \
        --matter-roots "/srv/matters;/Volumes/matters" \
        --otel-endpoint "https://collector.internal/v1/traces"

The checked-in `managed-settings.json` is a template: it carries
`REPLACE-WITH-...` placeholders, runs the guard in observation mode, and
tolerates a missing sandbox. Every one of those is correct for a first checkout
and wrong for a real matter environment.

This script produces the deployable file without those defaults, and without
the practice's own values ever entering the repository. Output defaults to
`dist/managed-settings.production.json`, which is gitignored.

Values come from CLI flags or environment variables, never from a committed
file:

    CLAUDE_FIRM_NAME        --firm-name
    CLAUDE_ORG_UUID         --org-uuid
    CLAUDE_MATTER_ROOTS     --matter-roots
    OTEL_EXPORTER_OTLP_ENDPOINT  --otel-endpoint
    CLAUDE_HOOK_PATH        --hook-path

The script refuses to write output that still contains a placeholder. A
half-rendered production file is worse than no file: it looks deployable and
silently disables the control it appears to configure.

Rendering is an engineering step, not a compliance certification. Run
`scripts/preflight-validate.py --mode production` against the output, and see
`docs/release-checklist.md` for the gates rendering does not cover.
"""

import argparse
import json
import os
import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

PLACEHOLDER = "REPLACE-WITH"
DEFAULT_TEMPLATE = REPO_ROOT / "managed-settings.json"
DEFAULT_OUTPUT = REPO_ROOT / "dist" / "managed-settings.production.json"
DEFAULT_HOOK_PATH = "/etc/claude-code/hooks/matter-guard.js"

# The five OpenTelemetry keys are a set. Disabling telemetry means removing all
# of them together, not leaving an exporter pointed at nothing.
TELEMETRY_KEYS = (
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_METRICS_EXPORTER",
    "OTEL_LOGS_EXPORTER",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
)


def resolve(flag_value, env_name):
    """A CLI flag wins over the environment. Neither is read from a file."""
    if flag_value:
        return flag_value
    return os.environ.get(env_name, "")


def rewrite_hook_commands(hooks: dict, hook_path: str) -> None:
    """Point every registered matter-guard command at the deployed path.

    A managed settings file has no variable expansion, so the command is a
    literal path and must match the platform it is deployed to. Deploying the
    Linux path to macOS silently disables the guard: the command fails to
    launch and the session continues.
    """
    for entries in hooks.values():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for hook in entry.get("hooks", []) or []:
                if not isinstance(hook, dict):
                    continue
                command = hook.get("command")
                if isinstance(command, str) and "matter-guard.js" in command:
                    hook["command"] = f'node "{hook_path}"'


def find_remaining_placeholders(obj, path="") -> list:
    """Every location still holding a REPLACE-WITH value, for the error message."""
    found = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            found.extend(find_remaining_placeholders(value, f"{path}.{key}" if path else key))
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            found.extend(find_remaining_placeholders(value, f"{path}[{i}]"))
    elif isinstance(obj, str) and PLACEHOLDER in obj:
        found.append(path or "<root>")
    return found


def render(
    template_path: pathlib.Path,
    output_path: pathlib.Path,
    firm_name: str,
    org_uuid: str,
    matter_roots: str,
    otel_endpoint: str,
    hook_path: str,
    disable_telemetry: bool,
    force: bool,
) -> int:
    if not template_path.exists():
        print(f"ERROR: template not found ({template_path})")
        return 1

    try:
        settings = json.loads(template_path.read_text(encoding="utf8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: {template_path} is not valid JSON: {exc}")
        return 1

    errors = []
    if not firm_name:
        errors.append("firm name is required (--firm-name or CLAUDE_FIRM_NAME)")
    if not org_uuid:
        errors.append("org UUID is required (--org-uuid or CLAUDE_ORG_UUID)")
    if not matter_roots:
        errors.append("matter roots are required (--matter-roots or CLAUDE_MATTER_ROOTS)")
    if not disable_telemetry and not otel_endpoint:
        errors.append(
            "telemetry endpoint is required (--otel-endpoint or "
            "OTEL_EXPORTER_OTLP_ENDPOINT), or pass --disable-telemetry deliberately"
        )
    for value, label in (
        (firm_name, "firm name"),
        (org_uuid, "org UUID"),
        (matter_roots, "matter roots"),
        (otel_endpoint, "telemetry endpoint"),
        (hook_path, "hook path"),
    ):
        if value and PLACEHOLDER in value:
            errors.append(f"{label} is itself a placeholder: {value!r}")

    # A relative matter root matches nothing and the guard refuses it outright,
    # so catching it here is better than shipping a file that fails closed.
    if matter_roots:
        for root in matter_roots.split(";"):
            root = root.strip()
            if root and not pathlib.PurePath(root).is_absolute():
                errors.append(f"matter root is not an absolute path: {root!r}")

    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        print(f"FAIL: {len(errors)} error(s) found")
        return 1

    env = settings.setdefault("env", {})
    env["CLAUDE_MATTER_ROOTS"] = matter_roots
    env["CLAUDE_MATTER_MODE"] = "enforce"

    if disable_telemetry:
        for key in TELEMETRY_KEYS:
            env.pop(key, None)
        settings.pop("_telemetry_note", None)
    else:
        env["CLAUDE_CODE_ENABLE_TELEMETRY"] = "1"
        env["OTEL_EXPORTER_OTLP_ENDPOINT"] = otel_endpoint

    settings["forceLoginOrgUUID"] = org_uuid

    claude_md = settings.get("claudeMd", "")
    if isinstance(claude_md, str):
        settings["claudeMd"] = claude_md.replace("REPLACE-WITH-YOUR-FIRM-NAME", firm_name)

    sandbox = settings.setdefault("sandbox", {})
    sandbox["enabled"] = True
    sandbox["failIfUnavailable"] = True
    sandbox["allowUnsandboxedCommands"] = False

    hooks = settings.get("hooks")
    if isinstance(hooks, dict):
        rewrite_hook_commands(hooks, hook_path)
    else:
        print("ERROR: template has no hooks block: the matter guard is not wired up")
        print("FAIL: 1 error(s) found")
        return 1

    # The template's own deployment notes describe defaults that no longer
    # apply once rendered. Leaving them in a production file is misleading.
    for note in ("_template_comment", "_failIfUnavailable_note"):
        settings.pop(note, None)

    remaining = find_remaining_placeholders(settings)
    if remaining:
        print("ERROR: rendered output still contains REPLACE-WITH placeholders at:")
        for location in remaining:
            print(f"  - {location}")
        print("FAIL: refusing to write a half-rendered production file")
        return 1

    if output_path.exists() and not force:
        print(f"ERROR: {output_path} already exists (pass --force to overwrite)")
        print("FAIL: 1 error(s) found")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # newline='\n' keeps the file LF on Windows, matching the rest of the repo.
    with open(output_path, "w", encoding="utf8", newline="\n") as fh:
        json.dump(settings, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    # The file carries the practice's own deployment values. Keep it off other
    # accounts on a shared machine.
    try:
        os.chmod(output_path, 0o600)
    except OSError:
        pass

    print(f"wrote {output_path}")
    if disable_telemetry:
        print(
            "WARNING: telemetry is disabled. The practice then has no record of "
            "what was sent, which clause 17.5 requires be recorded in Schedules 1 and 8."
        )
    print(
        "NEXT: python3 scripts/preflight-validate.py --mode production "
        f"{output_path}"
    )
    print("NOTE: do not commit this file. See docs/release-checklist.md.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Render a production managed settings file from the template.",
    )
    parser.add_argument("--firm-name", help="practice name substituted into claudeMd")
    parser.add_argument("--org-uuid", help="the practice's Anthropic organisation UUID")
    parser.add_argument(
        "--matter-roots",
        help="absolute matters root and every alias, semicolon separated",
    )
    parser.add_argument("--otel-endpoint", help="OTLP collector endpoint")
    parser.add_argument(
        "--disable-telemetry",
        action="store_true",
        help="deliberately remove the five OpenTelemetry keys instead of setting an endpoint",
    )
    parser.add_argument(
        "--hook-path",
        help=f"installed path of matter-guard.js (default {DEFAULT_HOOK_PATH})",
    )
    parser.add_argument(
        "--template",
        default=str(DEFAULT_TEMPLATE),
        help="template to render (default managed-settings.json)",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="output path (default dist/managed-settings.production.json)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite an existing output file",
    )
    args = parser.parse_args(argv)

    hook_path = resolve(args.hook_path, "CLAUDE_HOOK_PATH") or DEFAULT_HOOK_PATH

    return render(
        template_path=pathlib.Path(args.template).resolve(),
        output_path=pathlib.Path(args.output).resolve(),
        firm_name=resolve(args.firm_name, "CLAUDE_FIRM_NAME"),
        org_uuid=resolve(args.org_uuid, "CLAUDE_ORG_UUID"),
        matter_roots=resolve(args.matter_roots, "CLAUDE_MATTER_ROOTS"),
        otel_endpoint=resolve(args.otel_endpoint, "OTEL_EXPORTER_OTLP_ENDPOINT"),
        hook_path=hook_path,
        disable_telemetry=args.disable_telemetry,
        force=args.force,
    )


if __name__ == "__main__":
    sys.exit(main())
