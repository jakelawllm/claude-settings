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

## Owner packet (fill to close this gate)

Do not edit this section to invent a decision. The legal/risk owner supplies the values below; engineering then applies the matching option.

| Field | Owner supplies |
|---|---|
| Chosen option | `A` (strict prohibition) or `B` (leave-gated permission) |
| Decided by | Named legal/risk owner |
| Date | ISO date of decision |
| Rationale | Short written reason on the matter / policy file |

**After Option A is recorded, engineering must:**
1. Remove the clause 7.3 expert-report pathway from `ai-policy-legal-practice-template.docx` (authoritative) and regenerate the `.md` with `scripts/docx-to-md.py`.
2. Confirm `managed-settings.json` `claudeMd` and `skills/ai-policy-compliance/SKILL.md` already state the absolute ban (no change if already aligned).
3. Re-run `python scripts/check-clause-refs.py` and the compliance test suite.

**After Option B is recorded, engineering must:**
1. Leave clause 7.3 in the policy DOCX (or adjust only if the leave conditions change).
2. Update `managed-settings.json` `claudeMd` and `skills/ai-policy-compliance/SKILL.md` to the leave-gated pathway (prior leave on the matter file required).
3. Re-run clause-ref and compliance tests.

Until the Decision record fields above are non-PENDING, production preflight and the release checklist treat this gate as open.
