# Internal MVP Remaining Issues

## Readiness decision

**Status:** NOT READY

**Assessed commit:** `8ec769a1e50f`

**Assessment date:** 2026-09-08

Offline synthetic repository, container-boundary and records-recovery checks pass. The authenticated target run remains blocked by incomplete login and a failing nested-sandbox probe. Confidential-matter requirements below remain separate; the historical internal-beta waivers do not approve client data. Completed engineering work is recorded in the [assessment](INTERNAL_MVP_READINESS_REPORT.md) and [container runbook](synthetic-container-checks.md), not retained as open work here.

## Internal-MVP blockers requiring human or external action

| ID | Severity | Issue | Evidence | Why ChatGPT could not complete it | Exact action required | Suggested owner | Verification method |
|---|---|---|---|---|---|---|---|
| MVP-01 | P1 | Authenticated managed target and required nested sandbox unavailable | [Current checks](synthetic-container-checks.md): Claude 2.1.263 installed; 35 offline boundary checks pass, but target auth status is logged out and the actual bubblewrap namespace probe exits 1. No completed external launcher/signature or approved-egress acceptance. | Interactive account consent cannot be supplied by repository code. The host blocks the required namespace operation; scoped administrative host configuration and the deploying authority are not supplied by this repository. Disposable diagnostics were attempted and protections were retained. | Complete `docker exec -it -w /home/node mvp-auth-20260908 claude auth login`; run the two documented live harnesses. Have the host administrator provide a supported scoped sandbox configuration or accepted alternate host. Rerun the exact bubblewrap probe, install actual account-bound managed settings, observe `/status`, and execute all launcher, signature, approved-egress and authenticated OS acceptance rows. | Account owner / deployment operator / host administrator | Live harnesses pass; bubblewrap probe exits 0; installed managed policy and every [OS acceptance row](os-isolation-acceptance.md) have actual target evidence. Offline network-none results cannot substitute for approved live egress. |
| MVP-02 | P1 for confidential use | Actual supplier, legal and data-flow approvals absent | [Supplier register](supplier-evidence-register.md), [legal-source register](legal-source-register.md), [data-flow model](data-flow-model.md) and adopted-policy placeholders remain incomplete. Preflight rejects unapproved/expired evidence. | Real tenant contracts, intended jurisdictions and principal decisions are private external facts; synthetic fixtures cannot establish them. | Before entering confidential information, name the approved account/tier/region, attach controlled contract and retention evidence, approve the clause 8.8 interpretation with date, verify selected court instruments and complete owner/checked/next-review fields. Verify actual collector output omits content and record identity-metadata access/retention. | Responsible principal / AI officer / privacy owner | Run production preflight with the completed real evidence root and retain the principal's approval plus observed deployment references outside this public repository. |
| MVP-03 | P1 for confidential use | Actual records process, storage and retention/hold are not accepted | Forty [synthetic recovery checks](synthetic-container-checks.md) pass, including interruption, retry, restore and cross-UID denial. They are direct hook events; no live-client filing, independent backup destination, encryption/retention/hold or records-service acceptance is established. | Actual storage, retention/legal-hold decisions, alert accountability and acceptance are owner facts. Engineering tests cannot designate an approved practice records process. | Supply the supervised records process required by the gate, or expressly approve an equivalent manual process for the limited test; choose actual storage and accountable operator, verify required encryption/access controls, file a live synthetic session, restore from the independent backup, compare hashes, and sign the retention/hold and filing-gap response procedure. Preserve originals during any legacy archive migration. | Records owner / deployment operator | Observed live SessionEnd filing and independent restore match source; unauthorized user is denied; owner accepts storage, retention/hold and gap handling. Existing 40-check results support engineering behavior only. |

## Non-blocking work recommended before wider production use

| ID | Priority | Issue | Reason deferred | Recommended next action |
|---|---|---|---|---|
| W-01 | P2 | Optional Claude automation's recorded OAuth rotation is overdue | Workflow 322652643 is verified disabled_manually and unnecessary for local/offline MVP tests; the [historical decision](policy-decisions/oauth-token-management.md) records an expired date. | If enabling it, rotate the stored secret using the account owner, record current rotation/next-review dates and ownership, replace the current disabled disposition with an approved credential record, run `gh workflow enable 322652643 --repo jakelawllm/claude-settings` and set `ENABLE_CLAUDE_WORKFLOW=true`, then verify one trusted invocation and one denied untrusted invocation. Keep it disabled otherwise. |
| W-02 | P3 | No property/fuzz/coverage program and only bounded live model sampling | Focused adversarial regressions cover the identified defects; model instructions cannot guarantee behavior. | After an accepted host baseline, add a versioned synthetic corpus for new tool payloads and adversarial conduct prompts; record actual model/client, expected outcomes and owner-approved thresholds before expanding usage. |
| W-03 | P3 | Supplementary policy review proposed expanding records to all client advice | Current clause 17.1 scope is deliberate legal wording; changing it needs a product/legal decision. The skill already requests broader records. | Principal should decide whether to amend clause 17.1; if approved, edit authoritative DOCX, regenerate Markdown, update conduct anchors and run `python scripts/verify.py`. |
| W-04 | P3 | macOS sandbox-alone and wider runtime versions are unaccepted | Current deployment design is Linux container/WSL2 only; native Windows is unsupported. | Add a distinct observed OS acceptance record before extending the supported host/version matrix; keep production preflight refusal until that evidence supports a code change. |

## Required manual test checklist

- [ ] Complete target interactive authentication and run the documented live E2E and conduct harnesses; keep tokens out of logs and source control.
- [ ] Repair the required nested sandbox with a supported scoped host configuration; rerun the exact failing probe, `claude doctor` and installed-session `/status` with the intended organisation.
- [ ] Complete the external launcher/signature refusal checks and approved live egress observation, including authenticated Read/Grep/Glob and the sabotaged-guard negative control. Existing offline subprocess probes are already recorded.
- [ ] On the accepted managed target, restart the client with retained synthetic state and verify actual live SessionEnd filing. Offline container restart/state and direct-hook recovery already pass.
- [ ] Before confidential use, approve supplier/legal/data-flow and collector observations, refresh current disabled-workflow evidence at release time, and pass production preflight with real evidence.
- [ ] Before confidential use, accept actual records storage, independent backup restore, required encryption, retention/hold and accountable filing-gap handling.

## External requirements

- Interactive login by the intended account owner in the prepared synthetic authentication container.
- Host administration or an alternative supported target that permits the required sandbox while preserving the documented boundary; actual launcher/signing and approved-egress authority.
- For confidential matters: actual account/contract/collector and principal/legal approvals, plus accepted records storage, backup, retention and an accountable operator.

No multi-region infrastructure, public onboarding, SOC 2 programme or enterprise-scale redesign is required. Optional GitHub Claude automation credentials are unnecessary for the internal tests.

## Known limitations accepted for the internal MVP

- Synthetic repository tests and temporary live harnesses do not certify an installed host. Use invented matters until the blockers above are closed.
- The hook does not parse shell commands or isolate same-user process/filesystem tampering. Use the accepted OS/container boundary and start a fresh session when changing matter.
- Archives are convenience JSONL copies. Use the approved external records process or an explicitly accepted manual equivalent, and preserve source transcripts until filing is verified.
- Policy templates need practice-specific adoption; the separate barristers protocol is not wired into the compliance skill. Use its own reviewed implementation before relying on automated conduct checks for that protocol.
- Model behavior and citations require practitioner verification. The repository supplies instructions and tests, not a guarantee of legal accuracy.
