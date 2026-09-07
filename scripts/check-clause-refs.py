"""Check that every clause and schedule reference resolves to the policy.

    python3 scripts/check-clause-refs.py

The settings, the skill and the README all cite clause numbers. Inserting a
clause renumbers everything after it, and a stale reference still looks like a
valid one: it points at a real clause about a different subject, which is worse
than pointing at nothing. This check therefore verifies both existence and, for
load-bearing references, the expected clause heading.

Exits non-zero if any reference does not resolve.
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
POLICY = ROOT / "ai-policy-legal-practice-template.md"
SOURCES = [
    ROOT / "README.md",
    ROOT / "skills" / "ai-policy-compliance" / "SKILL.md",
    ROOT / "managed-settings.json",
    ROOT / "settings.json",
    POLICY,
]
# The barristers protocol numbers its clauses independently of the practice
# policy, so its own cross-references are checked against itself.
SELF_CONTAINED = [ROOT / "ai-protocol-barristers-chambers.md"]

CLAUSE = re.compile(r"clause\s+(\d+(?:\.\d+)?)", re.IGNORECASE)
SUBCLAUSE_REF = re.compile(r"clause\s+(\d+(?:\.\d+)?\([a-z]+\))", re.IGNORECASE)
SCHEDULE = re.compile(r"Schedule\s+(\d+)")
MAJOR = re.compile(r"^## (\d+)\s\s(.+)$", re.MULTILINE)
SUB = re.compile(r"^\*\*(\d+\.\d+)\*\*\s+(.+)$", re.MULTILINE)

# Semantic anchors for the references that appear in the README and compliance
# skill. They catch the dangerous case where a renumbered policy leaves a stale
# reference pointing at a real but different clause.
EXPECTED_HEADINGS = {
    "2.2": "all use of artificial intelligence connected with the practice",
    "3.2": "Functions that do not generate substantive content",
    "5.3": "Higher-risk tasks require independent verification",
    "5.4": "must not be used to make a decision",
    "5.5": "Output must be assessed for register",
    "6": "Approved tools",
    "6.1": "Client information may only be entered into an approved tool",
    "6.2": "Anonymisation is not a substitute",
    "6.5": "Before a tool is approved",
    "6.8": "Personal accounts must not be used",
    "6.9": "A request to use a tool not in Schedule 1",
    "7": "Prohibited uses",
    "7.1": "prohibited without exception",
    "7.3": "expert report",
    "8": "Restricted information",
    "8.2": "Restricted information is",
    "8.3": "Restricted information must not be entered",
    "9": "Verification",
    "9.1": "responsible for its contents",
    "9.3": "responsible practitioner must confirm",
    "9.5": "It is not verification to ask a tool",
    "9.6": "Verification must not be carried out solely",
    "9.7": "specific portions of a document",
    "10": "Disclosure to courts and tribunals",
    "10.8": "document filed or served contains material",
    "11": "Experts and counsel",
    "11.5": "Briefs to counsel",
    "12": "Clients",
    "12.2": "client's own terms",
    "12.3": "client must be told",
    "12.5": "client asks whether a tool has been used",
    "12.6": "Clients must be warned",
    "13.4": "indicators at Schedule 7",
    "14": "Costs",
    "14.2": "time recorded and billed",
    "14.3": "must not increase the cost",
    "15": "Recording, transcription and note-taking",
    "15.3": "Recording must not begin",
    "15.5": "Recording, transcription and note-taking by any means",
    "15.6": "transcript produced by a tool is not evidence",
    "16": "Privacy and information security",
    "17": "Records",
    "17.2": "record must identify",
    "17.4": "retained for the same period",
    "17.5": "maintains logging",
    "18": "Training",
    "20": "Incidents",
    "20.1": "report it to the AI Officer",
    "20.2": "not itself a disciplinary matter",
    "20.3": "AI Officer must assess",
    "21": "Compliance and consequences",
}


def clause_index(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for num, heading in MAJOR.findall(text) + SUB.findall(text):
        if num in found:
            raise ValueError(f"duplicate clause identifier {num}")
        found[num] = heading.strip()
    return found


def schedule_index(text: str) -> set[str]:
    numbers = re.findall(r"^## Schedule (\d+)\s", text, re.MULTILINE)
    if len(numbers) != len(set(numbers)):
        raise ValueError("duplicate schedule identifier")
    return set(numbers)


def subclause_index(text: str) -> set[str]:
    result, current = set(), None
    for line in text.splitlines():
        clause = SUB.match(line)
        if clause:
            current = clause.group(1)
        elif line.startswith("## "):
            current = None
        match = re.match(r"^- \*\*\(([a-z]+)\)\*\*", line)
        if current and match:
            key = f"{current}({match.group(1)})"
            if key in result:
                raise ValueError(f"duplicate subclause identifier {key}")
            result.add(key)
    return result


def check_sources(
    sources: list[pathlib.Path], clauses: dict[str, str], schedules: set[str], subclauses: set[str] | None = None
) -> list[str]:
    failures: list[str] = []
    for src in sources:
        if not src.exists():
            failures.append(f"{src.name}: required reference source is missing")
            continue
        text = src.read_text(encoding="utf8")
        rel = src.relative_to(ROOT).as_posix()
        for ref in sorted(set(SUBCLAUSE_REF.findall(text))):
            if ref not in (subclauses or set()):
                failures.append(f"{rel}: subclause {ref} does not exist in the policy")
        for ref in sorted(set(CLAUSE.findall(text)), key=lambda s: [int(x) for x in s.split(".")]):
            if ref not in clauses:
                failures.append(f"{rel}: clause {ref} does not exist in the policy")
                continue
            expected = EXPECTED_HEADINGS.get(ref)
            if expected and expected.lower() not in clauses[ref].lower():
                failures.append(
                    f"{rel}: clause {ref} exists but now has heading/content "
                    f"{clauses[ref]!r}, expected to contain {expected!r}"
                )
        for ref in sorted(set(SCHEDULE.findall(text)), key=int):
            if ref not in schedules:
                failures.append(f"{rel}: Schedule {ref} does not exist in the policy")
    return failures


def main() -> int:
    policy = POLICY.read_text(encoding="utf8")
    clauses = clause_index(policy)
    schedules = schedule_index(policy)

    failures = check_sources(SOURCES, clauses, schedules, subclause_index(policy))

    for doc in SELF_CONTAINED:
        if not doc.exists():
            failures.append(f"{doc.name}: required policy document is missing")
            continue
        text = doc.read_text(encoding="utf8")
        rel = doc.relative_to(ROOT).as_posix()
        own = clause_index(text)
        own_sched = schedule_index(text)
        own_sub = subclause_index(text)
        for ref in sorted(set(SUBCLAUSE_REF.findall(text))):
            if ref not in own_sub:
                failures.append(f"{rel}: subclause {ref} does not exist in that document")
        for ref in sorted(set(CLAUSE.findall(text)), key=lambda s: [int(x) for x in s.split(".")]):
            if ref not in own:
                failures.append(f"{rel}: clause {ref} does not exist in that document")
        for ref in sorted(set(SCHEDULE.findall(text)), key=int):
            if ref not in own_sched:
                failures.append(f"{rel}: Schedule {ref} does not exist in that document")

    if failures:
        print("Unresolved or stale references:")
        for failure in failures:
            print(" ", failure)
        return 1

    print(
        f"All clause and schedule references resolve ({len(clauses)} clauses, "
        f"{len(schedules)} schedules), including semantic anchors."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValueError as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
