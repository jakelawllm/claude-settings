# Internal MVP Remaining Issues

## Readiness decision

**Status:** READY — synthetic internal MVP only

**Assessed commit:** `0b46e79` (verified baseline; this acceptance update changes documentation only)

**Assessment date:** 2026-09-08

The [delegated owner acceptance](policy-decisions/internal-mvp-owner-acceptance.md) completes all 12 operational decisions for the exact tested synthetic installation. Command and interactive workflows, signed restart, installed controls, isolation, filing and encrypted recovery have passed. No unresolved P0 or P1 remains within that approved scope. Confidential/client material is outside it: MVP-02 and MVP-03 below remain mandatory before that expansion. Existing historical NOT READY decisions are superseded for the synthetic scope, not retroactively changed into production approval.

## Internal-MVP blockers requiring human or external action

| ID | Severity | Issue | Evidence | Why ChatGPT could not complete it | Exact action required | Suggested owner | Verification method |
|---|---|---|---|---|---|---|---|

None for the approved synthetic scope. Start through the signed adapter in the [operator runbook](synthetic-container-checks.md); no further owner sign-off or login is required.

## Non-blocking work recommended before wider production use

| ID | Priority | Issue | Reason deferred | Recommended next action |
|---|---|---|---|---|
| MVP-02 | P1 if confidential use is introduced | Actual supplier/legal/data-flow and production deployment adoption are incomplete | The supplier/legal/production operational registers retain unverified fields; last real preflight refused 73 governance errors. Synthetic owner acceptance supplies no account contract or legal opinion. | Before client data, record actual account/tier/region, controlled terms and retention sources, current jurisdiction-specific legal approval and dated clause 8.8 decision; adopt production deployment/key and telemetry choices. Complete the controlled registers and run `python scripts/preflight-validate.py --mode production --evidence-root <completed-controlled-evidence-root> <installed-managed-settings.json>` on accepted Linux; require exit 0. Owners: responsible principal and privacy/deployment owners. |
| MVP-03 | P1 if confidential use is introduced | Client records obligations and independent recovery-key custody remain unestablished | Seven actual encrypted restore checks passed, but the original key stayed on the source host. The accepted manual process covers invented test data only. | Records/legal owners must adopt storage, access logging, retention/hold/deletion and gap response; place recovery material with an approved independent custodian. Restore a synthetic backup without original host/key, compare source hash and verify unauthorised access refusal, then record the controlled acceptance. Preserve originals. |
| W-01 | P2 | Optional Claude automation's recorded OAuth rotation is overdue | Workflow 322652643 is verified disabled_manually and unnecessary for internal tests; the [historical decision](policy-decisions/oauth-token-management.md) records the expired date. | Keep it disabled. If enabling, have its account owner rotate the secret, record current dates/ownership and approved disposition, run `gh workflow enable 322652643 --repo jakelawllm/claude-settings`, set `ENABLE_CLAUDE_WORKFLOW=true`, then verify one trusted and one denied untrusted invocation. |
| W-02 | P3 | Live model sampling and payload coverage are bounded | Adversarial regressions cover identified defects; instructions cannot guarantee model behaviour. No dedicated fuzz/coverage programme is claimed. | Add a versioned synthetic corpus for new tool payloads and conduct prompts; record actual model/client and expected outcomes before expanding usage. |
| W-03 | P3 | Broader records wording remains an owner decision | Supplementary review proposed extending clause 17.1 to all client advice; current legal wording is deliberate and the skill already requests broader records. | Principal decides whether to amend clause 17.1. If approved, edit authoritative DOCX, regenerate Markdown, update conduct anchors and run `python scripts/verify.py`. |
| W-04 | P3 | Other host/client versions are unaccepted | Executed evidence covers the pinned Linux image and Claude 2.1.263. Native Windows is unsupported; macOS sandbox-alone is untested. | Before changing the host/client/image, rebuild from an updated base and execute the runbook's exact helper, managed tool, egress, signature and sabotaged-guard checks. Do not perform in-place package upgrades of the compatibility image. |

## Required manual test checklist

No manual acceptance check is outstanding for the approved synthetic scope. For each future session, follow the [accepted filing procedure](policy-decisions/internal-mvp-owner-acceptance.md): verify the expected private JSONL after exit and stop the next test if filing is missing or malformed. This is an operating duty, not another approval gate.

Before widening to confidential use, execute the concrete MVP-02 production preflight and MVP-03 independent-custody restore listed above.

## External requirements

None is outstanding to start the prepared synthetic test. Continue using existing authorised SSH/authentication and the signed adapter. No new credentials, host work, collector, records service or confidential data is required.

Confidential-use expansion requires actual selected-account contract/legal references and an approved records process with independent recovery-key custody, as specified in MVP-02/03. Optional GitHub automation credentials are unnecessary for the approved test.

## Known limitations accepted for the internal MVP

- Use invented matters in the tested environment until confidential-use approvals are complete. Technical results are bounded to the exact host/image/client and test trust anchor; they are not independent legal or security certification.
- The hook evaluates shell access by cwd and does not isolate a malicious trusted host operator. The tested OS/container boundary keeps sibling matters unmounted; start a fresh session when changing matter.
- Archives are convenience JSONL copies; the owner adopts supervised filing and preservation during evaluation. The key remains on the source host, and host/key-loss risk is accepted only for invented test data. No client retention policy or independent key recovery is claimed.
- The client reports a Linux sandbox glob-rule warning. Read-deny globs expand existing paths and do not dynamically cover matching files created within the same Bash command; retain all deny rules and keep secrets out of the selected synthetic matter. Outside-matter isolation is separately tested.
- Telemetry-disabled operation and its metadata gap are accepted for this synthetic test. A production decision or an observed real collector remains required before confidential use.
- Policy templates need practice-specific adoption; the separate barristers protocol is not wired into the compliance skill. Apply its separately reviewed procedure when relevant.
- Practitioners must verify model output and citations. The repository supplies controls and tests, not a guarantee of legal accuracy.
