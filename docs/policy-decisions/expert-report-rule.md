# Policy decision: expert-report rule

## Status

PENDING — awaiting decision from responsible legal/risk owner.

**Do not close Gate 5 until this file is updated with a decision and the policy files are aligned.**

## The inconsistency

The repository contains a deliberate mismatch documented in README.md and CLAUDE.md:

- **Policy clause 7.3** (ai-policy-legal-practice-template.docx): permits expert-report preparation where prior leave is obtained from the responsible practitioner.
- **claudeMd standing instruction** (managed-settings.json): prohibits drafting or preparing any part of an expert report, without qualification.
- **Compliance skill** (skills/ai-policy-compliance/SKILL.md): prohibits expert report work outright.

## Decision required

The responsible legal/risk owner must decide one of:

**Option A — Follow the standing instruction (strict prohibition):**
Remove the clause 7.3 pathway from the policy document. The tool never assists with expert reports in any circumstance.

**Option B — Follow the policy (leave-gated permission):**
Update the standing instruction and compliance skill to reflect the clause 7.3 pathway: expert report preparation is permitted only where prior leave has been obtained and recorded on the matter file.

## Files to update once decision is made

1. ai-policy-legal-practice-template.docx (authoritative) → regenerate .md
2. managed-settings.json (claudeMd field)
3. skills/ai-policy-compliance/SKILL.md

## Decision record

- **Decision:** [PENDING]
- **Decided by:** [PENDING]
- **Date:** [PENDING]
- **Rationale:** [PENDING]
