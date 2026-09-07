# Internal MVP Remaining Issues

## Readiness decision

**Status:** NOT READY

**Assessed commit:** `0d6b842`

**Assessment date:** 2026-09-07

Synthetic repository tests can be run. A confidential-matter internal MVP remains blocked by missing deployment and owner evidence below. These are external access, configuration and acceptance tasks; the approved architecture does not place a launcher, container platform or records service in this repository. See the [assessment](INTERNAL_MVP_READINESS_REPORT.md) for completed fixes and executed validation.

## Internal-MVP blockers requiring human or external action

| ID | Severity | Issue | Evidence | Why ChatGPT could not complete it | Exact action required | Suggested owner | Verification method |
|---|---|---|---|---|---|---|---|
| MVP-01 | P1 | No accepted managed single-matter deployment | [OS acceptance](os-isolation-acceptance.md) and [operational register](operational-evidence-register.md) have no accepted host evidence. Native Windows has no supported isolation boundary. WSL live model call failed on expired OAuth, and its 2.1.220 client is below the deployment minimum; native live hook tests do not establish OS containment. | No candidate deployment, installed managed-policy authority, accepted image/signing process or working Linux/WSL model credentials was supplied. Approved Approach 3 assigns those systems externally. | Provision the selected Linux container (or the same container inside WSL2); install and record an accepted Claude version within the declared range, then authenticate its approved account; install the generated single-matter settings/hook/skill with controlled ownership; verify bundle/signature and actual client version; execute every OS acceptance row including disabled/missing hook, sibling shell access, egress and restart controls; record controlled evidence references. | Deployment operator / IT owner | `claude doctor`, in-session `/status`, live E2E on the target, manifest `--verify`, and OS-observed negative controls all pass. Production preflight on that target accepts its real evidence. |
| MVP-02 | P1 | Actual supplier, legal and data-flow approvals absent | [Supplier register](supplier-evidence-register.md), [legal-source register](legal-source-register.md), [data-flow model](data-flow-model.md) and adopted-policy placeholders remain incomplete. Preflight rejects unapproved/expired evidence. | Real tenant contracts, intended jurisdictions and principal decisions are private external facts; synthetic fixtures cannot establish them. | Before entering confidential information, name the approved account/tier/region, attach controlled contract and retention evidence, approve the clause 8.8 interpretation with date, verify selected court instruments and complete owner/checked/next-review fields. Verify actual collector output omits content and record identity-metadata access/retention. | Responsible principal / AI officer / privacy owner | Run production preflight with the completed real evidence root and retain the principal's approval plus observed deployment references outside this public repository. |
| MVP-03 | P1 | Confidential transcript filing and recovery not accepted | Hook produces plaintext JSONL convenience copies; [records contract](records-schema.md) has no shipped producer/service. No approved backup/restore, alert handling or retention evidence is recorded. | Repository code cannot configure the practice's records storage, access permissions, backup destination or retention decision. The existing production gate requires a supervised records service. A manual alternative for a limited internal test needs explicit principal/records-owner approval against every listed control; this review does not approve that substitution. | Provide the supervised records process required by the existing gate, or obtain explicit approval for an equivalent controlled manual process for this limited test; choose approved storage and an accountable operator; verify ACLs/encryption as required by that storage, file a synthetic transcript, record source/copy SHA-256, interrupt a copy and recover from source, restore a backup and compare hashes, assign retention/hold and filing-gap handling. If upgrading a central archive, map legacy same-name folders using trusted records without deleting originals. | Records owner / deployment operator | Follow [operations recovery](operations.md); retained copy and restored backup match source hash; unauthorised account cannot read; owner signs the filing/retention and gap-response procedure. |

## Non-blocking work recommended before wider production use

| ID | Priority | Issue | Reason deferred | Recommended next action |
|---|---|---|---|---|
| W-01 | P2 | Optional Claude automation's recorded OAuth rotation is overdue | Workflow 322652643 is verified disabled_manually and unnecessary for local/offline MVP tests; the [historical decision](policy-decisions/oauth-token-management.md) records an expired date. | If enabling it, rotate the stored secret using the account owner, record current rotation/next-review dates and ownership, replace the current disabled disposition with an approved credential record, run `gh workflow enable 322652643 --repo jakelawllm/claude-settings` and set `ENABLE_CLAUDE_WORKFLOW=true`, then verify one trusted invocation and one denied untrusted invocation. Keep it disabled otherwise. |
| W-02 | P3 | No property/fuzz/coverage program and only bounded live model sampling | Focused adversarial regressions cover the identified defects; model instructions cannot guarantee behavior. | After an accepted host baseline, add a versioned synthetic corpus for new tool payloads and adversarial conduct prompts; record actual model/client, expected outcomes and owner-approved thresholds before expanding usage. |
| W-03 | P3 | Supplementary policy review proposed expanding records to all client advice | Current clause 17.1 scope is deliberate legal wording; changing it needs a product/legal decision. The skill already requests broader records. | Principal should decide whether to amend clause 17.1; if approved, edit authoritative DOCX, regenerate Markdown, update conduct anchors and run `python scripts/verify.py`. |
| W-04 | P3 | macOS sandbox-alone and wider runtime versions are unaccepted | Current deployment design is Linux container/WSL2 only; native Windows is unsupported. | Add a distinct observed OS acceptance record before extending the supported host/version matrix; keep production preflight refusal until that evidence supports a code change. |

## Required manual test checklist

- [ ] On the candidate container, record `claude doctor`, `/status`, actual version/account and managed policy ownership; complete live E2E with working credentials.
- [ ] Observe sibling-file and egress denial at OS level with the hook working, then sabotaged; demonstrate no fallback when the hook or sandbox is unavailable.
- [ ] Restart the client/host with retained synthetic state and verify same-matter access, sibling refusal and correct SessionEnd archive.
- [ ] Capture approved collector observations and verify no prompt, answer, tool-content or raw API-body data is exported; approve any identity metadata.
- [ ] Complete supplier/legal approvals, refresh the actual disabled-workflow API observation using the OAuth addendum, and run production preflight against the real evidence root.
- [ ] Execute synthetic filing failure/recovery and backup restore; compare source/restored hashes and verify records access/retention ownership.

## External requirements

- One controlled Linux-container or WSL2-container test environment, approved authentication and actual deployment/signing authority.
- Actual approved account/contract/collector configuration and principal/legal decisions for the intended matters.
- Approved records storage and an accountable operator able to demonstrate recovery, access control and retention.

No multi-region infrastructure, public onboarding, SOC 2 programme or enterprise-scale redesign is required for this internal MVP. Optional GitHub Claude automation credentials are not a prerequisite.

## Known limitations accepted for the internal MVP

- Synthetic repository tests and temporary live harnesses do not certify an installed host. Use invented matters until the blockers above are closed.
- The hook does not parse shell commands or isolate same-user process/filesystem tampering. Use the accepted OS/container boundary and start a fresh session when changing matter.
- Archives are convenience JSONL copies. Use the approved external records process or an explicitly accepted manual equivalent, and preserve source transcripts until filing is verified.
- Policy templates need practice-specific adoption; the separate barristers protocol is not wired into the compliance skill. Use its own reviewed implementation before relying on automated conduct checks for that protocol.
- Model behavior and citations require practitioner verification. The repository supplies instructions and tests, not a guarantee of legal accuracy.
