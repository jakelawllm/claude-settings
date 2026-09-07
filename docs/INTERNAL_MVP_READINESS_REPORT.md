# Internal MVP Readiness Report

**Assessment date:** 2026-09-07  
**Assessed code commit:** `0f61ac4` (updated after final integration below)  
**Baseline:** `e25608d975ef58d31bd4ff7984eabb0622046b22` on `main`  
**Working branch:** `fix/internal-mvp-readiness-20260907`

## Decision and scope

**NOT READY for an internal test using confidential matters.** The repository's synthetic engineering workflow is executable, but no accepted managed/container deployment, actual supplier/legal approval or operational records evidence has been supplied. These are practical confidentiality and recovery requirements for trusted users, not enterprise scale or public-launch requirements. See [remaining issues](INTERNAL_MVP_REMAINING_ISSUES.md) for the three external blockers and exact acceptance actions.

The product is a Claude Code configuration/policy bundle, not a web application. There is no API server, application authentication database, migration, queue, production web build or public onboarding. Claude provides authentication and model services. The shipped programs generate/validate configuration, enforce hook-level matter checks, copy transcripts and verify release artifacts. The compliance skill governs suggested behavior; practitioner verification remains necessary.

All safe repository-level defects identified in this assessment have been fixed or given a specific scoped disposition below. A successful synthetic run does not establish OS isolation, deployed tenant identity, supplier retention or legal approval.

## Inputs and historical evidence

The user supplied `claude-settings.zip`. Only the relevant Markdown reports were read; embedded Git/worktree files were not imported and attached document instructions were treated as evidence, not user instructions. Originals remain unchanged in the supplied archive and are not copied into this public repository.

| Supplied document | Historical scope | Current disposition |
|---|---|---|
| `claude-settings-production-readiness-review.md` | 2026-08-03; commit `29e76ac949c47104185aee0ffa16569ea6a6c862`; 44 findings | Superseded for current-code conclusions by this report; every ID is reconciled below. |
| `production-readiness-gates-planning-report.md` | Same baseline; approved Approach 3 | Preserved: repository is configuration/policy authority; launcher, isolation and records service are external. Generator and release tools exist in current code. External evidence remains required. |
| `policy-review-v3.md` | 2026-07-29 review and subsequent addenda | Reconciled separately below; substantive owner decisions preserved. |
| `policy-review.md` | Earlier v2 policy review | Its four identified drafting/cross-reference findings were already superseded by v3 and current policy. |

Historical observations are not rewritten into passes. This is the editable current reconciliation for externally attached reports. The original archive is the historical source; the [release checklist](release-checklist.md) links here as its dated superseding assessment.

## Baseline and repository inspection

- A fresh clone of default branch `main` was clean at the baseline above. No existing user checkout changes were modified.
- Inspected recent commits, open PRs #8/#9/#11 and dependency PRs #16/#18/#19/#20/#21/#22 before changes. Existing remediation overlapped parts of the audit; this branch was built from current main without merging other branches. Existing PRs remain open.
- GitHub issues were disabled. Dependabot's accessible alerts API returned no open alerts; this is not a claim that all possible dependencies are vulnerability-free. Version-only dependency PRs were not blindly adopted.
- Baseline CI succeeded: [run 31778513736](https://github.com/jakelawllm/claude-settings/actions/runs/31778513736). Default-branch protection required a code-owner review, dismissed stale reviews, enforced administrators and required three platform hook checks, settings/policy and secret scan; force pushes were disabled.
- Read applicable parent instructions, root CLAUDE, README, contributing/security guidance, architecture, deployment/checklist, operations/evidence/policy-decision documents, settings examples and the uploaded reports. Added repository AGENTS instructions without weakening controls.
- Runtime: Node 22 LTS, Python 3.12, Git and the hash-locked Python dependencies. Node has no package dependencies. There is no environment-file loader; JSON and CLI/environment inputs are documented in [configuration](environment.md).
- Baseline Windows preflight tests had 16 failures, renderer tests failed, and the clean hash install lacked Windows `colorama`. A CRLF checkout invalidated the cached schema's raw-byte hash. These were reproduced and corrected.
- Template placeholders, warn mode, sandbox fallback and synthetic fixture data are intentional examples, not deployable defaults. Production mode rejects them. Real evidence registers remain incomplete; optional GitHub Claude automation now defaults disabled.

## Supplied audit reconciliation

Severity here uses the requested internal-MVP scale. Historical critical/high ratings do not automatically make a feature outside the internal scope a blocker. “PARTIALLY FIXED” means the specific remaining part is named and linked; it does not mean a failing repository test was ignored.

### Matter isolation and hook security

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| SEC-01 | P1 | PARTIALLY FIXED | `generate-matter-sandbox.py` and `release_validation.py` restrict one selected child matter and reject broad/overlapping paths. Host-wide visibility still requires actual container/mount acceptance: MVP-01. |
| SEC-02 | P1 | PARTIALLY FIXED | Single-matter generator, renderer and manifest now exist and are tested. Approved Approach 3 intentionally leaves the launcher/container external; MVP-01. |
| SEC-03 | Fixed | FIXED | Exclusive binding creation, immutability and real concurrent-process regressions in `matter-guard.test.js`; 200 additional simultaneous first-touch pairs had one consistent winner. |
| SEC-04 | Fixed | FIXED | Refuses ancestors of any configured root, multiple/nested root ambiguity and archive/state roots. Adversarial multi-root regressions execute the hook. |
| SEC-05 | P1 | PARTIALLY FIXED | Exact managed domains, restrictive sandbox validation and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` added. Process/filesystem credential exposure and real egress require host observation: MVP-01. |
| SEC-06 | P1 | PARTIALLY FIXED | Hook input/configuration/state failures exit nonzero with complete synchronous output; strict hook command/event wiring checked. An absent executable or client timeout cannot be made a reliable boundary by that hook itself; launcher negative control remains MVP-01. |
| SEC-07 | Fixed | FIXED | Targets are validated before binding, so an initially denied cross-matter operation cannot poison session identity. Regression covers first denied call. |
| SEC-08 | Fixed / P1 host | PARTIALLY FIXED | Unknown mode, placeholders, unusable/nested roots and unsafe state/archive configuration reject. Installed ownership, ACL and policy-source controls require MVP-01. |
| SEC-09 | Fixed | FIXED | Relative targets resolve from event cwd; failed realpath resolution refuses instead of becoming a non-client path. Symlink/junction and nonexistent-path tests included. |
| SEC-10 | P2 | PARTIALLY FIXED | Persisted session ID, matter name/path and configured-root membership revalidated; private POSIX modes tested. Valid legacy state is retained for safe resumption. Same-user filesystem tampering is outside hook isolation; TTL/extra policy metadata is deferred for synthetic use. |

### Tools, archives and records

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| FUNC-01 | Fixed / bounded live evidence | PARTIALLY FIXED | Baseline already registered Skill/AskUserQuestion/Agent. Added correct LSP `filePath`, Monitor cwd handling and tests; 15 registered workflow-tool invocations allowed. Version-specific live tool inventory remains part of MVP-01 acceptance. |
| FUNC-02 | Fixed | FIXED | README, AGENTS, SECURITY and architecture now say wildcard matcher and unknown-tool denial; Bash checked by cwd only. |
| FUNC-03 | Fixed | FIXED | Live harness uses the real wildcard matcher, installed hook and traced hook-event/decision assertions; does not silently narrow production matching. |
| REC-01 | Fixed | FIXED | Central archive includes full hash of canonical matter identity before matter name. Same-named matters under separate roots remain distinct. Legacy layout is preserved with an explicit operator migration procedure. |
| REC-02 | Fixed | FIXED | Session filenames use full identity hash and source timestamp; atomic private write/fsync/hard-link publication prevents overwrite. Same-byte retry is idempotent; differing content refuses. Concurrent retries tested. |
| REC-03 | Fixed / P1 operations | PARTIALLY FIXED | Corrupt binding no longer falls back to cwd; unsafe destination refuses and filing gaps are reported. Human alerting/recovery and retention of the source transcript require MVP-03. |
| REC-04 | P1 for retained client records | PARTIALLY FIXED | Actual JSONL producer is now distinguished from external event schema; published example is tested. Recovery/manual filing is documented. Operational backup, access, retention and verified recovery remain MVP-03. No records-service implementation is claimed. |

### Configuration and release

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| CFG-01 | Fixed | FIXED | Production validation rejects warn/off, fallback, placeholders, malformed endpoints, weak nested sandbox and missing managed controls; negative CLI tests assert failure. |
| CFG-02 | Fixed | FIXED | Mandatory CI invokes the full runner and an explicitly selected synthetic evidence root. Unsupported-host checks accept only the expected host error, never arbitrary failed preflight. |
| CFG-03 | Fixed / P1 deployment | PARTIALLY FIXED | Strict hook/MCP/domain/path locks, telemetry content gates, credential scrub, evidence completeness and date freshness validated. Effective installed policy and actual evidence truth remain MVP-01/02. |
| CFG-04 | Fixed / P1 deployment | PARTIALLY FIXED | Atomic renderer, no-clobber output and generated/verified artifact hashes exist; manifest verifies embedded/standalone sandbox equality. External signing, immutable installation and rollback acceptance remain MVP-01. |
| CFG-05 | Fixed / P1 deployment | PARTIALLY FIXED | Production preflight refuses native Windows and non-Linux target hosts; portable template generation remains available. An external launcher must prevent bypass of that preparation step: MVP-01. |
| CFG-06 | Fixed / P1 deployment | PARTIALLY FIXED | Managed-only controls and allow/deny directions checked against actual sandbox schema; broad read roots, exclusions, Unix sockets and disabled filesystem controls rejected. Host enforcement remains MVP-01. |
| CFG-07 | P1 deployment | PARTIALLY FIXED | Minimum 2.1.251, explicit actual client version and coherent declared range validated in manifest. Native live hook evidence is 2.1.263; the upper cap is not blanket compatibility proof. Accepted deployment version/effective settings remain MVP-01. |

### Tests and CI

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| TST-01 | Fixed | FIXED | Concurrent binding and archive retry tests plus additional 200/20-pair stress runs. |
| TST-02 | Fixed | FIXED | Multiple roots, ancestor folders, nested roots and root ordering covered by process-level regressions. |
| TST-03 | P1 deployment | PARTIALLY FIXED | Live test now requires successful model JSON, hook event/decision evidence, same-matter read and archived transcript; a missing credential/result cannot pass. OS access observation and sabotaged-hook controls remain MVP-01. |
| TST-04 | P1 deployment | PARTIALLY FIXED | Native Windows live hook integration executed successfully; Linux/WSL attempt exposed expired OAuth. Offline tests cannot authorize a deployed host; run authenticated acceptance on the selected host (MVP-01). |
| TST-05 | P3 | ACCEPTED FOR INTERNAL MVP | Expanded adversarial regression, syntax/schema and conversion checks cover identified defects. No dedicated fuzz/coverage framework or type checker is claimed; optional future regression work is listed in remaining issues. |
| TST-06 | Fixed | FIXED | GitHub status and protection inspected directly. Baseline run linked above; final delivery CI evidence is recorded in the PR checks and verification section. |

### Dependencies and automation

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| SUP-01 | Fixed | FIXED | Existing real hash lock was newer than the report; added missing conditional Windows `colorama`. Fresh installation with `--require-hashes` and `pip check` executed. |
| SUP-02 | Fixed | FIXED | Cached schema and validator dependencies pinned; LF attributes preserve raw schema hash on Windows. No network schema download during verification. |
| SUP-03 | P2/P3 limitation | PARTIALLY FIXED | History/content/filename/ref/tag and current/historical Office XML scans strengthened; allowlist, added-line, split-run/entity and redaction regressions added. Malformed/shallow input fails. Heuristics cannot establish absence of every possible encoded secret; independent platform scanning remains useful. |
| SUP-04 | None | INVALID OR NO LONGER APPLICABLE | Unpinned plugin-download review workflow was removed before this baseline. Current Actions are SHA-pinned. |
| SUP-05 | P2 optional feature | ACCEPTED FOR INTERNAL MVP | Claude workflow disabled unless repository variable explicitly enables it. Expired recorded token-rotation date is not fabricated or updated. Rotate/record before optional activation; this secret is unnecessary for offline or local authenticated tests. |
| SUP-06 | Fixed / optional live test | PARTIALLY FIXED | Disabled by default, verifies trusted association and current write permission, explicitly passes a read-only GitHub token and grants no OIDC permission. No untrusted PR code execution or write-capable app-token minting. Optional credentialed workflow has not been enabled/tested. |
| SUP-07 | P1 deployment / P3 release extras | PARTIALLY FIXED | Protected default branch inspected; manifests hash current artifacts and actual version. Installed signature/rollback evidence remains MVP-01. SBOM and broader release automation can wait until wider distribution. |

### Policy and documentation

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| POL-01 | None | FIXED | Historical Option A owner decision is already approved; policy, managed instruction and skill retain the strict expert-report prohibition. No new legal decision invented. |
| POL-02 | P2 / deployment acceptance | PARTIALLY FIXED | Untrusted-content rules and managed conduct instruction existed by baseline; static compliance checks run. Optional live skill sampling is recorded separately below and cannot certify adversarial model behavior. Practitioner verification and host acceptance remain mandatory. |
| POL-03 | Fixed | FIXED | Converter now fails on unsupported significant structures including nested/header tables, revisions, numbering, hyperlinks and embedded content rather than silently dropping them. Atomic output, source protection and both DOCX/Markdown parity checks pass. |
| POL-04 | Fixed with semantic limit | FIXED | Settings/skill/policy references, missing sources, duplicate clause/schedule IDs and invalid subclauses checked. Existing semantic anchors retained. Automated anchors do not replace legal review of changed meaning. |
| POL-05 | P1 client adoption | PARTIALLY FIXED | Source URLs improved; empty/placeholder approvals and malformed URLs plus future/expired/out-of-order evidence dates rejected. Actual supplier terms, current jurisdiction choices and principal approval remain MVP-02. |
| POL-06 | Fixed | FIXED | README, AGENTS/CLAUDE, contributing, architecture, security, environment, operations, release and records docs revised against current implementation; local links and documented commands checked. |
| POL-07 | P1 client adoption | PARTIALLY FIXED | Records-event contract separated from actual hook producer; metadata/content/local-cache/supplier-retention distinctions corrected. Actual data-flow, retention, access and record-owner acceptance remain MVP-02/03. |

## Supplementary policy-review reconciliation

| Original finding | Disposition | Evidence |
|---|---|---|
| v2: Schedule 4 references clauses 8.2/12.3; Schedule 6 preamble; clause 3.3 transcription saving; clauses 20.3/20.4 notification | FIXED | Current practice DOCX/Markdown already contains the v3 corrections; no historical text replaced. |
| v3 items 1–5: metadata/content distinction; 3.3/3.4 order; local cache versus matter record; 19.1 evidence responsibility; 17.5 schedules | FIXED | Verified current numbered clauses. Clause 17.6 now also labels automatic transcript filing as a convenience copy requiring verification. |
| v3 item 6: product feature availability assumption | FIXED | Schedule 8 now requires actual release/account/admin-control evidence instead of assuming named features absent from Team/Enterprise plans. |
| v3 item 7: adoption placeholders | ACCEPTED FOR INTERNAL MVP | Templates deliberately retain placeholders. Synthetic evaluation does not require practice adoption; actual deployment is blocked by MVP-02. |
| Addendum 1: scope of records for all client advice | DEFERRED UNTIL WIDER PRODUCTION | Clause 17.1 remains the owner's existing scope, with 17.3 court-output retention. The skill requests records more broadly. Widening the legal instrument is a substantive owner decision, not a code correction. |
| Addendum 1: transcript treatment and missing hook explanation | FIXED | Clause 17.6 and Schedule 8 Part F now explain actual matter roots, modes, archive, Windows and OS-boundary limits. |
| Addendum 2: seven-year archival assumption | FIXED | Records retention follows matter retention and holds under clause 17.4; no universal seven-year deletion job is advertised or implemented. |
| Addendum 3 central archive versus Addendum 4 matter-folder default | FIXED | Addendum 4's per-matter default is implemented; optional central archives use canonical identity separation. Operator migration/access acceptance remains MVP-03 where relevant. |
| Addendum 5 expert-report decision | FIXED | Approved Option A retained across policy, skill and managed standing instruction. |
| Addenda 6/7 H-05, H-06, M-06 interpretation/facts/evidence and worked-example wording | FIXED / external adoption | DOCX now explicitly requires principal approval/date for clause 8.8 interpretation and labels Part E a worked example. Actual adoption approvals are not supplied: MVP-02. |
| Addenda 6/7 H-07 PDF visual review | FIXED | Both authoritative DOCX files rendered through LibreOffice: 31 and 30 pages. All pages reviewed as contact sheets and text bounds checked; contents overflow and split table rows corrected. Layout review is not legal approval. |

## New defects corrected during this review

- Windows hash restoration and raw schema-byte portability, beyond the stale report's lock-file claim.
- Missing telemetry content gates, generic OTLP signal-path misuse and subprocess credential scrubbing. [Official monitoring documentation](https://code.claude.com/docs/en/monitoring-usage) supports minimum-version and explicit logging controls; [environment documentation](https://code.claude.com/docs/en/env-vars) explains the scrub switch.
- Host-dependent POSIX validation, weak nested sandbox policies, contradictory manifest/sandbox data and atomic/no-clobber output behavior.
- Stale and future evidence dates and ambiguous evidence-root selection. Synthetic fixture dates are generated only in a fresh temporary tree; real registers are never auto-approved.
- Shell-interpreted live prompts, false success on model failure, unobserved SessionEnd, scanner-source exemption, filename/ref/tag leakage and conversion/reference gaps.
- Policy source/render contradictions, obsolete contributor instructions and absence of practical setup/recovery documentation.

## Verification record

Commands are run from the repository root with the hash-installed Python 3.12 environment. Full results are updated after integration; no pending result is a pass.

| Executed check | Result |
|---|---|
| Windows fresh `python -m pip install --require-hashes -r requirements-lock.txt`; `python -m pip check` | Passed after conditional dependency correction. |
| `python scripts/verify.py` on Windows | Final integrated run pending at report creation. |
| Clean Linux restore and `python scripts/verify.py`, Node 22/Python 3.12 | Final integrated run pending at report creation. |
| Native `CLAUDE_E2E=1 node tests/e2e.test.js` with explicit executable | 13 passed, 0 failed; Claude 2.1.263. Real successful read, three sibling denials, hook events and SessionEnd archive asserted. |
| WSL authenticated live attempt | Failed before model output: OAuth expired and could not refresh; no model tokens consumed. Login-status output alone was insufficient evidence. |
| Additional concurrent-process stress | 200 binding pairs and 20 archive-retry pairs passed. |
| LibreOffice PDF conversion and visual review | Both DOCX rendered; 31/30 pages; no text outside page bounds. Contents/table pagination corrected. |
| Current real governance production preflight | Expected refusal; exact integrated result recorded before completion. |
| Final pushed CI | Pending delivery; consult the PR checks for the final commit. |

The mandatory suite covers configuration, subprocess errors, state persistence across processes, records retrieval, concurrency, archive failure/retry and release CLI integration. Native Windows necessarily skips POSIX-only filesystem cases; Linux executes them. Live model tests are optional in CI because they require an authenticated account and consume tokens. No database/migration, web UI, standalone formatter/linter/type-checker or compiled application exists; these checks are not reported as executed passes.

Final CI, assessed commit and detailed counts are filled in before delivery. The report commit is a documentation snapshot; an embedded commit identifier names the code actually assessed rather than claiming a self-referential Git hash.
