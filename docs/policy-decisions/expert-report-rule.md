# Policy decision: expert-report rule

## Status

APPROVED — Option A (strict prohibition), 2026-08-12.

The policy DOCX, generated Markdown, managed standing instruction and compliance skill now state the same absolute prohibition: the practice does not use a tool to draft or prepare any part of an expert report, and leave of the court does not cure that ban. An expert's own use of a tool remains a separate question under clause 11.

## The former inconsistency

Before this decision the repository contained a deliberate mismatch documented in README.md and CLAUDE.md:

- **Policy clause 7.3** (ai-policy-legal-practice-template.docx): permitted expert-report preparation where prior leave was obtained.
- **claudeMd standing instruction** (managed-settings.json): prohibited drafting or preparing any part of an expert report, without qualification.
- **Compliance skill** (skills/ai-policy-compliance/SKILL.md): prohibited expert report work outright.

## Decision required (closed)

The responsible legal/risk owner chose one of:

**Option A — Follow the standing instruction (strict prohibition):**
Remove the clause 7.3 leave pathway from the policy document. The tool never assists with expert reports in any circumstance. **← chosen**

**Option B — Follow the policy (leave-gated permission):**
Update the standing instruction and compliance skill to reflect a leave-gated pathway: expert report preparation permitted only where prior leave has been obtained and recorded on the matter file.

## Files updated

1. `ai-policy-legal-practice-template.docx` (authoritative) — clause 7.3 body rewritten to absolute prohibition; clause number and "expert report" subject preserved for `check-clause-refs.py`.
2. `ai-policy-legal-practice-template.md` — regenerated via `scripts/docx-to-md.py`.
3. `managed-settings.json` (`claudeMd` field) — already absolute; no change required.
4. `skills/ai-policy-compliance/SKILL.md` — already absolute; no change required.
5. README.md and CLAUDE.md — deliberate-exception language removed / updated to record resolution.

## Decision record

- **Decision:** Option A — strict prohibition
- **Decided by:** jacobcd123
- **Date:** 2026-08-12
- **Rationale:** Simplicity and lowest risk for beta.

## Owner packet (filled)

| Field | Value |
|---|---|
| Chosen option | `A` (strict prohibition) |
| Decided by | jacobcd123 |
| Date | 2026-08-12 |
| Rationale | Simplicity and lowest risk for beta |

**After Option A (completed):**
1. Clause 7.3 leave pathway removed from `ai-policy-legal-practice-template.docx` and Markdown regenerated.
2. Confirmed `managed-settings.json` `claudeMd` and `skills/ai-policy-compliance/SKILL.md` already state the absolute ban.
3. Clause-ref and compliance test suite re-run as part of the gate resolution PR.

Clause 11 (an expert's own use of a tool, leave of the court, and disclosure obligations on the expert) is unchanged. That remains a different question from the practice's prohibition in clause 7.3.
