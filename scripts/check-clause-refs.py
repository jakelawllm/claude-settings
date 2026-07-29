"""Check that every clause and schedule reference resolves to the policy.

    python scripts/check-clause-refs.py

The settings, the skill and the README all cite clause numbers. Inserting a
clause renumbers everything after it, and a stale reference still looks like a
valid one: it points at a real clause about a different subject, which is worse
than pointing at nothing. This is the check that catches that.

Exits non-zero if any reference does not resolve.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
POLICY = ROOT / "ai-policy-legal-practice-template.md"
SOURCES = [
    ROOT / "README.md",
    ROOT / "skills" / "ai-policy-compliance" / "SKILL.md",
]

CLAUSE = re.compile(r"clause\s+(\d+(?:\.\d+)?)", re.I)
SCHEDULE = re.compile(r"Schedule\s+(\d+)")


def main() -> int:
    policy = POLICY.read_text(encoding="utf8")
    clauses = set(re.findall(r"^\*\*(\d+\.\d+)\*\*", policy, re.M))
    clauses |= set(re.findall(r"^## (\d+)\s\s", policy, re.M))
    schedules = set(re.findall(r"^## Schedule (\d+)\s", policy, re.M))

    failures = []
    for src in SOURCES:
        if not src.exists():
            continue
        text = src.read_text(encoding="utf8")
        rel = src.relative_to(ROOT).as_posix()
        for ref in sorted(set(CLAUSE.findall(text))):
            if ref not in clauses:
                failures.append(f"{rel}: clause {ref} does not exist in the policy")
        for ref in sorted(set(SCHEDULE.findall(text))):
            if ref not in schedules:
                failures.append(f"{rel}: Schedule {ref} does not exist in the policy")

    if failures:
        print("Unresolved references:")
        for f in failures:
            print(" ", f)
        return 1

    print(f"All clause and schedule references resolve ({len(clauses)} clauses, "
          f"{len(schedules)} schedules).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
