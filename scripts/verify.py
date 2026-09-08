"""Run the reproducible, credential-free repository checks on all supported hosts.

Use Python from the environment installed with requirements-lock.txt. Live Claude
sessions and deployment acceptance are separate, explicit operator steps.
"""

from __future__ import annotations

import ast
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
PYTHON = sys.executable


def run(*command: str, expected: int = 0) -> str:
    print("\n$ " + " ".join(command), flush=True)
    env = dict(os.environ, PYTHON=PYTHON, PYTHONUTF8="1")
    result = subprocess.run(command, cwd=ROOT, env=env, text=True,
                            encoding="utf-8", errors="replace", capture_output=True,
                            timeout=300)
    print(result.stdout, end="")
    print(result.stderr, end="", file=sys.stderr)
    if result.returncode != expected:
        raise RuntimeError(f"command exited {result.returncode}, expected {expected}")
    return result.stdout


def local_links() -> None:
    """Check repository-relative Markdown links without making network requests."""
    # Git prunes ignored runtime/cache trees without visiting their Markdown.
    # Include tracked files even under ignored directories (for example a
    # deliberately versioned .claude/README.md), plus new nonignored docs.
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard",
         "--", "*.md"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
        timeout=30,
    )
    if result.returncode:
        raise RuntimeError("could not list repository Markdown files with Git")
    count = 0
    for relative_path in sorted(set(result.stdout.split("\0")) - {""}):
        path = ROOT / relative_path
        text = re.sub(r"```.*?```", "", path.read_text(encoding="utf-8"), flags=re.S)
        for target in re.findall(r"\]\((<[^>]+>|[^\s)]+)(?:\s+\"[^\"]*\")?\)", text):
            target = target.strip("<>")
            parsed = urlsplit(target)
            if parsed.scheme or target.startswith(("#", "//")):
                continue
            relative = unquote(parsed.path)
            if relative and not (path.parent / relative).exists():
                raise RuntimeError(f"broken local link: {path.relative_to(ROOT)} -> {relative}")
            count += 1
    print(f"PASS: {count} local Markdown links resolve")


def main() -> int:
    os.chdir(ROOT)
    run("node", "--version")
    run(PYTHON, "--version")
    run(PYTHON, "-m", "pip", "check")
    run("git", "diff", "--check")
    for path in sorted((ROOT / "scripts").glob("*.py")):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    print("PASS: Python syntax")
    run(PYTHON, "tests/verify-local-links.test.py")
    for folder in ("hooks", "tests"):
        for path in sorted((ROOT / folder).glob("*.js")):
            run("node", "--check", str(path.relative_to(ROOT)))
    suites = sorted((ROOT / "tests").glob("*.test.js"))
    for path in suites:
        if path.name != "e2e.test.js":
            run("node", str(path.relative_to(ROOT)))
    schema = ROOT / "schemas/claude-code-settings.schema.json"
    expected = schema.with_suffix(schema.suffix + ".sha256").read_text().split()[0]
    if hashlib.sha256(schema.read_bytes()).hexdigest() != expected:
        raise RuntimeError("cached settings schema hash mismatch")
    run(PYTHON, "-m", "check_jsonschema", "--schemafile", str(schema),
        "managed-settings.json", "settings.json", "matter-settings.json")
    with tempfile.TemporaryDirectory(prefix="claude-settings-verify-") as temporary:
        temp = Path(temporary)
        for stem in ("ai-policy-legal-practice-template", "ai-protocol-barristers-chambers"):
            generated = temp / (stem + ".md")
            run(PYTHON, "scripts/docx-to-md.py", stem + ".docx", str(generated))
            # Git can check out CRLF on Windows; generated output must itself be LF.
            if b"\r\n" in generated.read_bytes():
                raise RuntimeError(f"generated Markdown is not LF: {stem}")
            if generated.read_text(encoding="utf-8") != (ROOT / (stem + ".md")).read_text(encoding="utf-8"):
                raise RuntimeError(f"DOCX/Markdown drift: {stem}")
        run(PYTHON, "scripts/check-clause-refs.py")
        run(PYTHON, "scripts/scan-history.py")
        run(PYTHON, "scripts/scan-docx-xml.py", "--history")
        run(PYTHON, "scripts/preflight-validate.py", "--mode", "template", "managed-settings.json")
        evidence = temp / "synthetic-evidence"
        run("node", "tests/synthetic-evidence.js", str(evidence))
        output = run(PYTHON, "scripts/preflight-validate.py", "--mode", "production",
                     "--evidence-root", str(evidence), "test-fixtures/synthetic-production.json",
                     expected=1 if sys.platform != "linux" else 0)
        if sys.platform != "linux":
            reason = ("native Windows is not supported for production; use Linux or WSL2"
                      if sys.platform == "win32" else
                      "production requires a Linux/WSL2 target; this host is not a supported isolation path")
            errors = [line.strip() for line in output.splitlines() if "ERROR:" in line]
            if errors != ["ERROR: " + reason]:
                raise RuntimeError(f"expected only unsupported host refusal; observed {errors}")
        # This is a verification artefact; dirty trees are permitted only here.
        manifest_args = [PYTHON, "scripts/generate-release-manifest.py", "--allow-dirty",
                         "--claude-code-version", "2.1.263",
                         "--output", str(temp / "manifest.json"), "--production-settings",
                         "test-fixtures/synthetic-production.json", "--sandbox-policy",
                         "test-fixtures/synthetic-sandbox-policy.json"]
        run(*manifest_args)
        run(*manifest_args, "--verify")
    local_links()
    print(f"\nPASS: {len(suites) - 1} offline suites and all repository checks")
    print("NOT RUN: live Claude E2E, managed deployment, OS isolation and external governance acceptance")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
