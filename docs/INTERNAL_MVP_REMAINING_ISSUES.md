# Internal MVP Remaining Issues

## Readiness decision

**Status:** NOT READY

**Assessed commit:** `a6e28e079a0b`

**Assessment date:** 2026-09-08

The controlled authenticated command workflow passes, but interactive onboarding and `/status` remain incomplete. Confidential-matter use is additionally blocked by the two adoption requirements below. Executed evidence covers actual installed controls, sandbox and sibling isolation, restricted egress, signed launch, SessionEnd filing and encrypted independent-machine restore in the [assessment](INTERNAL_MVP_READINESS_REPORT.md) and [operator runbook](synthetic-container-checks.md). Technical repairs formerly listed as MVP-01 are recorded there rather than retained as unfinished work. Responsible-owner approvals are not inferred from engineering results. The protected `OWNER-REVIEW.md` maps all 12 operational rows to existing observations and the exact decisions still needed.

## Internal-MVP blockers requiring human or external action

| ID | Severity | Issue | Evidence | Why ChatGPT could not complete it | Exact action required | Suggested owner | Verification method |
|---|---|---|---|---|---|---|---|
| MVP-04 | P1 for the interactive workflow | One-time interactive onboarding and `/status` are incomplete | Valid existing authentication and actual signed model sessions pass. Real interactive entry reaches theme/subscription OAuth before `/status`; `acceptance/interactive-status-final.json` records the attempt without raw terminal content. | The installed client treats `claude auth login` and interactive onboarding separately. Normal onboarding requires a fresh browser OAuth interaction plus explicit security notes. Setting its completion flag would skip that sequence; no supported independent completion command was found. | Open a real SSH terminal on the prepared host and run `python3 "$HOME/claude-mvp-acceptance-20260908/launcher/controlled-run.py" interactive`. Complete the normal theme, OAuth, security notes and workspace trust screens; run `/status`, verify the installed managed source/hooks and exit normally. Keep login codes and account details out of chat/Git. | Authenticated account owner / test operator | `/status` is actually observed in that signed target; record only a private controlled reference and safe pass/fail summary. Command-mode synthetic tests already pass and need not be repeated solely to complete onboarding. |
| MVP-02 | P1 for confidential use | Actual supplier, legal, data-flow and deployment adoption approvals are absent | [Supplier](supplier-evidence-register.md), [legal](legal-source-register.md) and [operational](operational-evidence-register.md) registers retain unresolved owner/date/reference fields. Real production preflight exits 1 with 73 governance errors. The tested signing key is an engineering trust anchor; telemetry was disabled for synthetic tests. | Actual account contracts, applicable jurisdictions, approved deployment authority and principal decisions were not supplied. Test results establish observations, not those external facts. | Record the intended account/tier/region and controlled contract/retention sources; complete supplier and legal owner/checked/next-review fields and dated clause 8.8 approval. Adopt the tested host/version/key or supply an approved replacement and rerun its affected acceptance checks. Review the existing technical evidence and enter accountable operational references. Approve telemetry-disabled operation and its metadata gap, or configure the actual collector and observe its content exclusion/access/retention before adoption. | Responsible principal / AI officer / privacy and deployment owners | Run `python scripts/preflight-validate.py --mode production --evidence-root <completed-controlled-evidence-root> <installed-managed-settings.json>` on the accepted Linux target. Require exit 0 and retain approvals and evidence references outside this public repository. Do not replace real registers with test fixtures. |
| MVP-03 | P1 for confidential use | Records storage, retention/hold, recovery-key custody and filing-gap accountability are not adopted | [Records requirements](records-schema.md); actual managed SessionEnd archive and seven-check encrypted restore passed. Only ciphertext travelled to the separate Windows machine; its key stayed on the source host. No off-host key escrow or owner-approved retention/hold/process evidence exists. | Engineering cannot select the practice's retention obligations, name an accountable records operator or declare a storage/key custodian approved. A restore with the original key available does not establish recovery after losing that host/key. | Approve the actual encrypted storage and supervised records process, or an explicit manual equivalent for the limited test. Assign a records operator, retention/hold and filing-gap response. Place recovery key material with an approved independent custodian, then restore a synthetic backup without access to the original host/key and compare its source hash; preserve existing originals. Record the controlled result and acceptance in the operational register. | Records owner / deployment operator / key custodian | The independent-custody restore matches source; wrong/unauthorised access is denied; the owner accepts storage, access/logging, retention/hold, deletion and gap handling. Existing SessionEnd and seven-check restore evidence need not be repeated unchanged merely to add an owner name. |

## Non-blocking work recommended before wider production use

| ID | Priority | Issue | Reason deferred | Recommended next action |
|---|---|---|---|---|
| W-01 | P2 | Optional Claude automation's recorded OAuth rotation is overdue | Workflow 322652643 is verified disabled_manually and unnecessary for internal tests; the [historical decision](policy-decisions/oauth-token-management.md) records the expired date. | Keep it disabled. If enabling, have its account owner rotate the secret, record current dates/ownership and approved disposition, run `gh workflow enable 322652643 --repo jakelawllm/claude-settings`, set `ENABLE_CLAUDE_WORKFLOW=true`, then verify one trusted and one denied untrusted invocation. |
| W-02 | P3 | Live model sampling and payload coverage are bounded | Adversarial regressions cover identified defects; instructions cannot guarantee model behaviour. No dedicated fuzz/coverage programme is claimed. | Add a versioned synthetic corpus for new tool payloads and conduct prompts; record actual model/client and expected outcomes before expanding usage. |
| W-03 | P3 | Broader records wording remains an owner decision | Supplementary review proposed extending clause 17.1 to all client advice; current legal wording is deliberate and the skill already requests broader records. | Principal decides whether to amend clause 17.1. If approved, edit authoritative DOCX, regenerate Markdown, update conduct anchors and run `python scripts/verify.py`. |
| W-04 | P3 | Other host/client versions are unaccepted | Executed evidence covers the pinned Linux image and Claude 2.1.263. Native Windows is unsupported; macOS sandbox-alone is untested. | Before changing the host/client/image, rebuild from an updated base and execute the runbook's exact helper, managed tool, egress, signature and sabotaged-guard checks. Do not perform in-place package upgrades of the compatibility image. |

## Required manual test checklist

- [ ] Complete the signed target's normal interactive onboarding in a real terminal and inspect `/status` using the command above.
- [ ] Before confidential use, adopt the actual supplier/legal/data-flow and tested deployment evidence, including the signing authority and telemetry decision; complete accountable register references and run the real production preflight above.
- [ ] Before confidential use, accept actual records storage, retention/hold and gap handling; perform a synthetic restore using independently held recovery material without the original host/key.

## External requirements

- Account owner present for the interactive client's browser OAuth/security-notes sequence. Existing command-mode authentication remains valid.
- Actual selected-account contracts and responsible principal/legal/privacy/deployment decisions, supplied as controlled references rather than credentials or confidential documents in Git.
- Approved records storage/process, accountable operator and independent recovery-key custody.

No host-administration access, launcher implementation or confidential data is required to run the existing command-mode synthetic checks; interactive entry has the separate onboarding step above. No multi-region infrastructure, public onboarding, SOC 2 programme or enterprise-scale redesign is required. Optional GitHub Claude automation credentials are unnecessary for this test.

## Known limitations accepted for the internal MVP

- Use invented matters in the tested environment until confidential-use approvals are complete. Technical results are bounded to the exact host/image/client and test trust anchor; they are not independent legal or security certification.
- The hook evaluates shell access by cwd and does not isolate a malicious trusted host operator. The tested OS/container boundary keeps sibling matters unmounted; start a fresh session when changing matter.
- Archives are convenience JSONL copies, and the current recovery key remains on the source host. Preserve source transcripts until verified filing; do not treat the demonstrated encrypted round trip as recovery after host/key loss.
- The client reports a Linux sandbox glob-rule warning. Read-deny globs expand existing paths and do not dynamically cover matching files created within the same Bash command; retain all deny rules and keep secrets out of the selected synthetic matter. Outside-matter isolation is separately tested.
- Telemetry is disabled for synthetic sessions. The resulting metadata gap must be adopted or a real collector separately observed before confidential use.
- Policy templates need practice-specific adoption; the separate barristers protocol is not wired into the compliance skill. Apply its separately reviewed procedure when relevant.
- Practitioners must verify model output and citations. The repository supplies controls and tests, not a guarantee of legal accuracy.
