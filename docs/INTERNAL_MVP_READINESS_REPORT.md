# Internal MVP Readiness Report

**Assessment date:** 2026-09-08

**Assessed repository code commit:** `a6e28e079a0b`

**Managed deployment source:** `9a0372a123d1f038378bb6360806c139cfed2f61`

**Baseline:** `e25608d975ef58d31bd4ff7984eabb0622046b22` on `main`

**Working branch:** `fix/internal-mvp-readiness-20260907`

## Decision and scope

**NOT READY for the interactive workflow or confidential matters; the controlled authenticated command workflow passes.** The required nested sandbox, actual account-bound managed settings, installed Skill, SessionEnd filing, signed launcher and restricted egress have now been exercised on the pinned Linux target. Normal and sabotaged-guard sessions passed with a live sibling-inode observer; encrypted archive restore from a separate machine also passed. The later host-remediation addendum records the exact evidence and supersedes earlier host/authentication blockers. Interactive onboarding and actual `/status` observation remain MVP-04; the client requires a separate normal OAuth/security-notes sequence despite valid command-mode authentication. Actual supplier/legal/data-flow and accountable records approvals remain P1 prerequisites for confidential use. The historical internal-beta waivers do not approve client material. See [remaining issues](INTERNAL_MVP_REMAINING_ISSUES.md) for the outstanding actions.

The product is a Claude Code configuration/policy bundle, not a web application. There is no API server, application authentication database, migration, queue, production web build or public onboarding. Claude provides authentication and model services. The shipped programs generate/validate configuration, enforce hook-level matter checks, copy transcripts and verify release artifacts. The compliance skill governs suggested behavior; practitioner verification remains necessary.

All safe repository-level defects identified in this assessment have been fixed or given a specific scoped disposition below. Historical verification sections retain their assessed commits; the dated follow-up distinguishes later results. Fixture and hook-only passes do not establish OS isolation. The later managed-target checks include actual kernel-level observation and installed account-bound controls; they still do not establish contractual retention, legal approval or accountable practice adoption.

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
- Inspected recent commits, open PRs #8/#9/#11 and dependency PRs #16/#18/#19/#20/#21/#22 before changes. Existing remediation overlapped parts of the audit; this branch was built from current main without merging other branches. Existing PRs remain open. Final repository API inspection also confirmed secret scanning, push protection and Dependabot security updates enabled.
- GitHub issues were disabled. Dependabot's accessible alerts API returned no open alerts; this is not a claim that all possible dependencies are vulnerability-free. Pinned dependencies were retained; version-only update PRs remain open.
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
| SEC-01 | Fixed on assessed target | FIXED | Generator and validation restrict one selected child. Actual Read/Grep/Glob and interpreter/process routes, protected mounts and sibling-inode observation passed in normal and sabotaged managed sessions; see the host-remediation addendum. |
| SEC-02 | Fixed on assessed target | FIXED | Generator, renderer and manifest are tested. The external signed launcher now verifies installed artifacts and confines the selected matter before model startup. It remains an external deployment component under Approach 3. |
| SEC-03 | Fixed | FIXED | Exclusive binding creation, immutability and real concurrent-process regressions in `matter-guard.test.js`; 200 additional simultaneous first-touch pairs had one consistent winner. |
| SEC-04 | Fixed | FIXED | Refuses ancestors of any configured root, multiple/nested root ambiguity and archive/state roots. Adversarial multi-root regressions execute the hook. |
| SEC-05 | Fixed on assessed target | FIXED | Actual credential-path denials, subprocess scrub with a synthetic credential-name canary, restricted HTTPS proxy and 12 direct/proxy/DNS bypass checks passed. Actual vendor/data-flow approval remains separately tracked by POL-05/07. |
| SEC-06 | Fixed on assessed target | FIXED | Enforce-mode hook errors deny; output failure attempts exit 2. Actual sabotaged-guard sessions still cannot reach the sibling inode. Missing bubblewrap stops the managed CLI before model initialization; signed launcher tests refuse missing/altered controls. |
| SEC-07 | Fixed | FIXED | Targets are validated before binding, so an initially denied cross-matter operation cannot poison session identity. Regression covers first denied call. |
| SEC-08 | Fixed on assessed target | FIXED | Invalid configuration refuses. Installed read-only bundle, protected host ancestors and signing controls, effective source selection and actual protected-write denials were verified. |
| SEC-09 | Fixed | FIXED | Relative targets resolve from event cwd; failed realpath resolution refuses instead of becoming a non-client path. Symlink/junction and nonexistent-path tests included. |
| SEC-10 | P2 limitation | ACCEPTED FOR INTERNAL MVP | Persisted binding identity/root membership and private modes are revalidated. Linux mount isolation protects sibling matters; the trusted host operator controls their own files. Additional TTL/metadata is deferred for synthetic use; start a fresh session when changing matter. |

### Tools, archives and records

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| FUNC-01 | Fixed / bounded version evidence | FIXED | Correct LSP filePath and Monitor cwd handling are covered by regressions; 15 registered workflow-tool cases pass. Actual Claude 2.1.263 managed Skill, Read, Write, Grep, Glob and Bash paths were exercised. Future client/tool additions require acceptance. |
| FUNC-02 | Fixed | FIXED | README, AGENTS, SECURITY and architecture now say wildcard matcher and unknown-tool denial; Bash checked by cwd only. |
| FUNC-03 | Fixed | FIXED | Live harness uses the real wildcard matcher, repository hook via a temporary traced wrapper and hook-event/decision assertions; does not silently narrow production matching. |
| REC-01 | Fixed | FIXED | Central archive includes full hash of canonical matter identity before matter name. Same-named matters under separate roots remain distinct. Legacy layout is preserved with an explicit operator migration procedure. |
| REC-02 | Fixed | FIXED | Session filenames use full identity hash and source timestamp; atomic private write/fsync/hard-link publication prevents overwrite. Same-byte retry is idempotent; differing content refuses. Concurrent retries tested. |
| REC-03 | Fixed / P1 ownership | PARTIALLY FIXED | Corrupt/unsafe filing refuses with a gap report. Forty recovery checks and actual managed SessionEnd filing pass. Accountable gap response and approved source retention remain MVP-03. |
| REC-04 | P1 for client records | PARTIALLY FIXED | Actual managed JSONL archive was encrypted, copied to a separate Windows machine, returned and restored with matching hash. Seven checks include tamper/wrong-key and cross-UID denials. Accepted retention/hold, records process and key escrow remain MVP-03. |

### Configuration and release

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| CFG-01 | Fixed | FIXED | Production validation rejects warn/off, fallback, placeholders, malformed endpoints, weak nested sandbox and missing managed controls; negative CLI tests assert failure. |
| CFG-02 | Fixed | FIXED | Mandatory CI invokes the full runner and an explicitly selected synthetic evidence root. Unsupported-host checks accept only the expected host error, never arbitrary failed preflight. |
| CFG-03 | Fixed / P1 approval facts | PARTIALLY FIXED | Managed-only controls, content gates, scrub, evidence completeness and freshness are validated. Effective installed controls were exercised; actual owner/vendor/data-flow facts remain MVP-02. |
| CFG-04 | Fixed on assessed target | FIXED | Atomic renderer and coherent manifest hashes are tested. External signed launcher verifies the clean repository manifest against all four installed artifacts, protects trust ancestors and refuses modified controls. Source/session records and previous candidates are preserved for recovery. |
| CFG-05 | Fixed on assessed target | FIXED | Production preflight refuses unsupported hosts. External signed launcher also refuses native Windows and unsafe launch requests before model startup. |
| CFG-06 | Fixed on assessed target | FIXED | Actual managed filesystem, socket, privilege and egress denials pass under reviewed profiles. Exact client/runtime layout compatibility was fixed without weakening sandbox fallback or granting runtime capabilities. |
| CFG-07 | Fixed / exact-version limit | FIXED | Actual managed Claude 2.1.263 runs in a pinned image bound to the signed manifest. Minimum/range checks remain enforced; other versions/platforms are not certified by these results. |

### Tests and CI

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| TST-01 | Fixed | FIXED | Concurrent binding and archive retry tests plus additional 200/20-pair stress runs. |
| TST-02 | Fixed | FIXED | Multiple roots, ancestor folders, nested roots and root ordering covered by process-level regressions. |
| TST-03 | Fixed on assessed target | FIXED | Actual managed normal and sabotaged sessions each passed 44 checks plus five saved-result assertions; final signed target passed all 49 checks. Positive OS-observer controls passed before/after and no sibling inode was opened/read. |
| TST-04 | P1 interactive completion | PARTIALLY FIXED | Authenticated Linux-container E2E13 and conduct6 pass on 2.1.263; later managed tests exercise installed controls and permitted egress. Actual interactive `/status` is still blocked by separate onboarding: MVP-04. Earlier OAuth/sandbox failures remain historical. |
| TST-05 | P3 | ACCEPTED FOR INTERNAL MVP | Expanded adversarial regression, syntax/schema and conversion checks cover identified defects. No dedicated fuzz/coverage framework or type checker is claimed; optional future regression work is listed in remaining issues. |
| TST-06 | Fixed | FIXED | GitHub status and protection inspected directly. Baseline run linked above; final delivery CI evidence is recorded in the PR checks and verification section. |

### Dependencies and automation

| ID | Current severity | Disposition | Current evidence and remaining scope |
|---|---|---|---|
| SUP-01 | Fixed | FIXED | Existing real hash lock was newer than the report; added missing conditional Windows `colorama`. Fresh installation with `--require-hashes` and `pip check` executed. |
| SUP-02 | Fixed | FIXED | Cached schema and validator dependencies pinned; LF attributes preserve raw schema hash on Windows. No network schema download during verification. |
| SUP-03 | P3 heuristic limitation | ACCEPTED FOR INTERNAL MVP | Full history, independent index/current changes, nonignored new text and staged/current Office XML scans strengthened; allowlist, added-line, split-run/entity and redaction regressions added. Malformed/shallow input fails. Heuristics cannot establish absence of every possible encoded secret; GitHub secret scanning and push protection were also verified enabled; no scanner guarantees every arbitrary encoding. |
| SUP-04 | None | INVALID OR NO LONGER APPLICABLE | Unpinned plugin-download review workflow was removed before this baseline. Current Actions are SHA-pinned. |
| SUP-05 | P2 optional feature | ACCEPTED FOR INTERNAL MVP | GitHub workflow 322652643 was disabled during this review and its API state verified as disabled_manually; candidate YAML additionally requires an explicit enable variable. Expired recorded token-rotation date is not fabricated or updated. A same-day, artifact-bound disablement record is accepted by preflight; rotate/record before optional activation; this secret is unnecessary for offline or local authenticated tests. |
| SUP-06 | Fixed / optional live test | PARTIALLY FIXED | Verified remotely disabled, additionally requires explicit opt-in, verifies trusted association and current write permission, explicitly passes a read-only GitHub token and grants no OIDC permission. The explicit token prevents broader app-token minting. The fixed prompt is not a general code-execution sandbox; optional enablement still requires controlled acceptance. Optional credentialed workflow has not been enabled/tested. |
| SUP-07 | P3 release extras | ACCEPTED FOR INTERNAL MVP | Protected default branch and clean artifact hashes verified. External test-key signature, modified-control refusals and runtime integrity checks now execute. Practice adoption of that key/host remains MVP-02; SBOM and wider release automation are deferred. |

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
| Addenda 6/7 H-05, H-06, M-06 interpretation/facts/evidence and worked-example wording | PARTIALLY FIXED | DOCX now explicitly requires principal approval/date for clause 8.8 interpretation and labels Part E a worked example. Actual adoption approvals are not supplied: MVP-02. |
| Addenda 6/7 H-07 PDF visual review | FIXED | Both authoritative DOCX files rendered through LibreOffice: 31 and 30 pages. All pages reviewed as contact sheets and text bounds checked; contents overflow and split table rows corrected. Layout review is not legal approval. |

## New defects corrected during this review

- Windows hash restoration and raw schema/release-artifact byte portability, beyond the stale report's lock-file claim. Fresh Windows and Linux release inputs now have identical hashes.
- Missing telemetry content gates, generic OTLP signal-path misuse and subprocess credential scrubbing. [Official monitoring documentation](https://code.claude.com/docs/en/monitoring-usage) supports minimum-version and explicit logging controls; [environment documentation](https://code.claude.com/docs/en/env-vars) explains the scrub switch.
- Host-dependent POSIX validation, weak nested sandbox policies, contradictory manifest/sandbox data and atomic/no-clobber output behavior.
- Stale and future evidence dates and ambiguous evidence-root selection. Synthetic fixture dates are generated only in a fresh temporary tree; real registers are never auto-approved.
- Shell-interpreted live prompts, false success on model failure, unobserved SessionEnd, scanner-source exemption, filename/ref/tag leakage and conversion/reference gaps.
- Policy source/render contradictions, obsolete contributor instructions and absence of practical setup/recovery documentation.

## Verification record

Commands were run from the repository root with the hash-installed Python 3.12 environment. Full suites passed at `bbf182b`. The subsequent `0d6b842` changes only checkout line-ending attributes: six release inputs were compared between a fresh Windows CRLF-default clone and Linux and matched byte-for-byte, and all 31 manifest assertions passed again in that Windows clone. No program logic changed after the full suites.

| Executed check | Result |
|---|---|
| Windows fresh `python -m pip install --require-hashes -r requirements-lock.txt`; `python -m pip check` | Passed after conditional dependency correction. |
| `python scripts/verify.py` on Windows | Passed: 12 suites, 712 assertions, 0 failures; 5 explicit POSIX hook skips plus 1 POSIX-only renderer assertion not run. Node 24.18.0 / Python 3.12.10. |
| Clean Linux restore and `python scripts/verify.py`, Node 22/Python 3.12 | Passed: 12 suites, 718 assertions, 0 failures, 0 platform skips. Node 22.23.2 / Python 3.12.14 in an isolated non-root verification container. This image is test infrastructure, not a supplied deployment launcher. |
| Native `CLAUDE_E2E=1 node tests/e2e.test.js` with explicit executable | 13 passed, 0 failed; Claude 2.1.263. Real successful read, three sibling denials, hook events and SessionEnd archive asserted. |
| `CLAUDE_COMPLIANCE_LIVE=1 node tests/compliance-live.js` | 6 passed, 0 failed on Claude 2.1.263. Actual allowed Skill invocations and manually inspected synthetic responses; ordinary draft/records, quoted injection and four refusal categories. |
| WSL authenticated live attempt | Failed before model output: OAuth expired and could not refresh; no model tokens consumed. That WSL installation was Claude 2.1.220, also below the new deployment minimum; select an accepted client version on the actual target. Login-status output alone was insufficient evidence. |
| Additional concurrent-process stress | 200 binding pairs and 20 archive-retry pairs passed. |
| Documented generator → renderer → manifest → `--verify` | Passed on a clean Windows checkout at `4f0a133`, using only `examples/matter-definition.json` and synthetic deployment values. |
| OSV `POST https://api.osv.dev/v1/querybatch` with installed public PyPI package/version pairs from `python -m pip list --format=json` | 19 packages checked; 0 known advisory matches on 2026-09-07. Separate accessible GitHub Dependabot alerts list was empty. These are dated database observations, not a guarantee of unknown-vulnerability absence. |
| LibreOffice PDF conversion and visual review | Both DOCX rendered; 31/30 pages; no text outside page bounds. Contents/table pagination corrected. |
| `python scripts/preflight-validate.py --mode production dist/managed-settings.production.json` with real repository governance | Expected refusal, exit 1 with 77 errors on Windows: 3 absent installed hook paths, 1 unsupported host and 73 unresolved governance fields. The explicitly recorded disabled OAuth workflow is accepted on the verified date; missing client approvals remain blocked. |
| Pushed delivery CI at `345fb82` | [CI run 34076719893](https://github.com/jakelawllm/claude-settings/actions/runs/34076719893): all 5 required jobs passed (Linux/macOS/Windows hook checks, settings/policy and secret scan). The final documentation commit is checked again in [PR #23](https://github.com/jakelawllm/claude-settings/pull/23). |
| Additional GitHub checks | Both [CodeQL code-quality analyses](https://github.com/jakelawllm/claude-settings/actions/runs/34076718572) completed successfully. The security-alert API returned 404/no analysis for this PR, so no zero-alert claim is made from that API. Optional Cursor Bugbot could not run because its user/team usage limit was reached; it reported neutral with no annotations. It is not a required gate or prerequisite for the internal test. |

Final offline assertion breakdown (each command prefixed with `node tests/`):

| Command suffix | Windows passed | Linux passed | Failed |
|---|---:|---:|---:|
| `compliance-evaluation.test.js` | 15 | 15 | 0 |
| `docs-control-claims.test.js` | 16 | 16 | 0 |
| `docx-to-md.test.js` | 15 | 15 | 0 |
| `e2e-harness.test.js` | 12 | 12 | 0 |
| `generate-matter-sandbox.test.js` | 63 | 63 | 0 |
| `generate-release-manifest.test.js` | 31 | 31 | 0 |
| `matter-guard.test.js` | 127 | 132 | 0 |
| `preflight-validate.test.js` | 229 | 229 | 0 |
| `records-schema.test.js` | 12 | 12 | 0 |
| `render-production-settings.test.js` | 102 | 103 | 0 |
| `scan-docx-xml.test.js` | 30 | 30 | 0 |
| `scan-history.test.js` | 60 | 60 | 0 |
| **Total** | **712** | **718** | **0** |

The mandatory suite covers configuration, subprocess errors, state persistence across processes, records retrieval, concurrency, archive failure/retry and release CLI integration. Native Windows necessarily skips POSIX-only filesystem cases; Linux executes them. Live model tests are optional in CI because they require an authenticated account and consume tokens. No database/migration, web UI, standalone formatter/linter/type-checker or compiled application exists; these checks are not reported as executed passes.

The report commit is a documentation snapshot; the embedded commit identifier names the code actually assessed rather than claiming a self-referential Git hash. Final delivery CI also checks subsequent documentation commits.


## 2026-09-07 engineering reconciliation

This subsection records later engineering reconciliation without changing the historical verification record above.

- A fresh PR-head bundle was staged under `/dev-data/evidence/staging-pr23-20260907-unique/` and labelled **DEVELOPMENT EVIDENCE — NOT RELEASE GRADE**. The sandbox hash is `--hash=sha256:7f376bb40206c008f7210fc999b9a5b442d87b3b55a6f976757925b5bbb9431a`. Manifest verification returned exit `0`, but recorded `claude_code_version` `2.1.263` remains **UNVERIFIED** because the target container has no Claude CLI installed and no repository mount.
- The earlier live E2E/compliance claim is corrected to a host run with Claude `2.1.238`, below declared minimum `2.1.251`: E2E `13` passed / `0` failed, compliance `4` passed / `2` failed; `ordinary-client-email` and `cross-examination-evidence-generation` failed. Historical `2.1.263` results remain unchanged.
- Installed bundle inventory shows root-owned files: managed settings `0644`, hook `0755`, skill `0644`. Installed-policy effectiveness and ownership acceptance remain unverified.
- OS-isolation acceptance evidence is incomplete. External launcher is a repository non-goal. Sabotaged-guard negative control requires authorisation. Phase 2 interactive OAuth on target CLI was not completed.
- MVP-03 records drill was not completed. No records-drills artifact was produced and no client-integrated records service was demonstrated; direct-hook stdin is not records acceptance. MVP-03 remains open; MVP-02 remains unchanged, open and blocking.
- Decision remains **NOT READY**. Do not fill `OWNER-REQUIRED` rows or claim auth, container E2E, OS acceptance or records-service completion.


## 2026-09-08 remote remediation and current evidence

This section supersedes the current-state conclusions of the 2026-09-07 engineering reconciliation above without deleting its observations. Source code assessed: `8ec769a1e50f`. The original three modified files and new local-link test were preserved and reviewed. Open PRs, default branch and required CI were checked before edits; main was not merged or rewritten.

### Fixed during this follow-up

- **P1 — private runtime could be staged:** the untracked local agent home included authentication/session artifacts and was not ignored. Added `.claude-orch/` to Git exclusions without opening credentials. Inspection snapshots contain explicitly selected tracked source only.
- **P2 — link verification traversed downloaded runtime documentation:** Git-aware discovery now covers tracked and new nonignored Markdown, including deliberately tracked `.claude/` documents. Ignored runtime caches are pruned. Eight regression cases cover cache exclusions, tracked documentation, invalid links, Git failure, deletion and unreadable files. An unstaged-deletion regression was reproduced and fixed; links to a deleted document still fail.
- **P1 — candidate container protection was ineffective:** the old runtime was root, policy parent directories were writable by UID 65534, and the phase4 `--mount` destination literally contained `:ro` while remaining writable. The old containers are preserved and stopped; their original volume remains intact. The replacement runs UID 1000 with only Smith mounted, a read-only root/bundle, all capabilities dropped, no-new-privileges and no network. Installed Claude was actually executed as 2.1.263. The allow-all negative-control container is separate and stopped after testing.
- **P2 — no completed synthetic records drill evidence:** 40 offline checks now demonstrate real hook lifecycle, persistent state, sibling refusal, archive hashes/idempotency, permission failure/retry, interruption after a partial write, source preservation, restore and cross-UID read denial. This closes the engineering evidence gap, not the external records-service/owner gate.

### Executed follow-up validation

| Command / integration path | Observed result |
|---|---|
| Fresh Python 3.12 venv, `python -m pip install --require-hashes -r requirements-lock.txt`; `python -m pip check` | Both exit 0; no broken requirements. |
| `python scripts/verify.py` on Linux Node 22.23.2 / Python 3.12.3 | 12 offline Node suites: 718 assertions, 0 failures, 0 skips; 8 Python link regressions pass. Final full verification from the freshly restored environment exits 0; 71 repository Markdown links resolve. |
| `python -W error tests/verify-local-links.test.py`; `git diff --check` | 8 passed, no warnings; whitespace check exits 0. The initial deletion reproduction failed as expected; the corrected implementation was rerun. |
| `python3 offline-container-check.py` in the controlled evidence archive | 35 boundary checks and 5 oracle self-checks passed. Ten routes were exercised with normal and allow-all guards. Host inotify positive controls detected sibling opens/reads before and after; none occurred during denial probes. strace confirms target access errors on the same syscall line. |
| `python3 records-drill/reproduce.py` in that archive | 40 passed, 0 failed, 0 skipped. Interrupted staging file was retained separately; complete retry and tar restore matched the preserved source. |
| Manifest generation/verification with observed `--claude-code-version 2.1.263` and `--allow-dirty` | Exit 0 for development evidence. It is explicitly a dirty development snapshot, not a signed clean release. |
| `docker exec mvp-acceptance bwrap --unshare-user --ro-bind / / -- true` | Exit 1: namespace creation denied. Remains open; no bypass applied. |
| Target `claude auth status --json`, output filtered to login/method only | `loggedIn=false`, `authMethod=none`. No credential values read or copied. |
| Authenticated GitHub workflow-state API query | Optional workflow 322652643 remains `disabled_manually`; current UTC observation refreshed. Historical rotation and approvals unchanged. |

The first boundary script reported two archive failures because its trace selection omitted the failed stat syscall. The trace/oracle was corrected and every route rerun. Independent review then tightened the oracle to reject an unrelated missing-library error and made restart state use a fresh nonce; all checks passed again. Original logs/results remain in the controlled evidence archive.

The source-controlled [runbook](synthetic-container-checks.md) records the actual boundary, commands and limitations. External evidence includes `offline-container-check.py`, `offline-container-results.json`, the pinned image Dockerfile/build log, `container-configuration.json`, `nested-sandbox-probe.txt` and the records-drill reproduction/results. No raw credentials, authentication home, real transcripts or private identifiers are included in this repository.

### Still not established

The live synthetic authentication container is prepared with a private persistent home and ordinary egress, but login is incomplete. Live E2E/conduct calls were not executed against it; no token-bearing host files were reused. Its unfiltered egress and absent managed bundle make it unsuitable as proof of a confidential managed target.

The hardened offline candidate's nested sandbox is unavailable. Disposable no-data diagnostics with individual profile relaxations also failed; final candidates retain the default profiles and `failIfUnavailable` remains enforced. A supported scoped host configuration, authenticated installed-policy observation, real launcher/signature checks and approved-egress acceptance remain necessary. The outer Docker probes do not claim those passes.

Records results are direct hook engineering tests, not a live client SessionEnd or approved records service. Supplier/legal/data-flow, retention/hold, actual storage and release-owner facts remain unresolved. No `OWNER-REQUIRED` evidence row was populated and no historical approval was fabricated.


### 2026-09-08 clean-checkout delivery verification

A new single-branch clone at `a55e88c` was transferred through Git's reachable-object protocol without local runtime files or credential configuration. Its canonical GitHub origin was restored and its working tree remained clean. The already fresh Python 3.12.3 hash-locked environment ran `python scripts/verify.py` from that clone: exit 0, 718 Node assertions plus 8 Python regressions, zero failures/skips, and 71 repository Markdown links resolved.

The documented generator and renderer then produced a separate clean synthetic bundle. Manifest generation and `--verify`, using the actually installed Claude 2.1.263 and **without** `--allow-dirty`, both exited 0. This is an unsigned clean synthetic candidate; it does not supply release-owner approval or fix the target sandbox/authentication limits.

Production preflight was executed in a disposable instance of the same image, with the real installed hook/settings paths and the clean checkout mounted read-only. It exited 1 with **73 unresolved governance errors**, all from the real registers. There were no missing installed-hook, Git-origin or expired-workflow-observation errors. An earlier source-only snapshot produced 75 errors, including two packaging/freshness errors; the complete clean checkout and freshly observed disabled-workflow record corrected those and the command was rerun. Synthetic fixture production preflight passed in the full runner, as expected; no real register was filled to achieve that pass.

All five required checks passed for candidate `a55e88c`: [CI run 34172769618](https://github.com/jakelawllm/claude-settings/actions/runs/34172769618). The final documentation commit is subsequently checked through [PR 23 checks](https://github.com/jakelawllm/claude-settings/pull/23/checks). This historical candidate result does not claim a future commit's pass. Optional live container E2E/conduct and installed `/status` remain unexecuted because target authentication is incomplete; nested sandbox, launcher/signature and approved live-egress acceptance remain open.


## 2026-09-08 authenticated synthetic follow-up

Historical observation at the commit below. Its remaining host-blocker conclusion is superseded by the later scoped-host-remediation addendum; the failed diagnostics remain preserved.

This later observation supersedes earlier statements that the synthetic authentication container is logged out or its live harnesses are unexecuted. The owner completed interactive login in the prepared container. Source commit `a4bb7adc85aa` was clean, PR 23 remained open, and both the required CI jobs and CodeQL analyses were green before this documentation update. SHA-256 comparison confirmed that the installed hook, live harnesses and compliance skill exactly matched that source before model calls.

| Executed command | Actual result |
|---|---|
| Target `claude auth status --json`, filtered to login/method | `loggedIn=true`, `authMethod=claude.ai`; no account identifiers, login codes or tokens retained in the report or evidence logs; login state stays in the private authentication volume. |
| `docker exec mvp-auth-20260908 claude --version` | Exit 0; 2.1.263. |
| `docker exec -e CLAUDE_E2E=1 mvp-auth-20260908 node /opt/claude-settings/tests/e2e.test.js` | Exit 0; 13 passed, 0 failed. Actual SessionStart, same-matter Read, SessionEnd archive persistence and cross-matter Read/Grep denials observed. |
| `docker exec -e CLAUDE_COMPLIANCE_LIVE=1 mvp-auth-20260908 node /opt/claude-settings/tests/compliance-live.js` | Exit 0; six passed, zero failed. All samples invoked the actual Skill tool; the captured synthetic answers were reviewed. |
| `docker exec mvp-auth-20260908 claude doctor` | Exit 0; npm-global 2.1.263, auto-updates deliberately disabled, no installation issues found. |

Conduct samples cover ordinary correspondence with a verification worklist and incomplete record, quoted instruction injection, affidavit/witness drafting, cross-examination evidence generation, expert-report drafting with claimed leave, and a knowingly invented citation. This is bounded sampled behavior, not general policy or legal certification. Raw synthetic answers and logs remain in the controlled evidence archive. The Docker copy API did not expose the tmpfs results file; reading that explicitly named synthetic output through `docker exec` recovered it successfully. No authentication volume or credential file was copied. Follow-up documentation checks resolved 72 local Markdown links; history scanning and whitespace validation exited 0. Repository code is unchanged in this follow-up.

Independent host diagnosis reproduced `clone(CLONE_NEWNS|CLONE_NEWUSER)` returning `EPERM` under the retained default container profiles. User namespaces are globally enabled, but Ubuntu's unprivileged-user-namespace AppArmor policy separately denies capabilities; no matching bwrap-specific host profile was available. Scoped administrative profile inventory/load access is unavailable to the review account. No safe image-only fix was established. The [runbook](synthetic-container-checks.md) gives the supported administrator investigation and verification sequence without global policy disablement, broad privileges or sandbox fallback.

**Decision remains NOT READY for the managed target or confidential matters.** Authentication and the synthetic live harnesses are complete. Installed organisation-bound managed settings, the required nested sandbox, external launcher/signature and approved live-egress acceptance remain open, along with owner prerequisites before confidential use. No owner-required register row was filled. The authentication container has ordinary bridge egress and no managed-policy mount; its successful calls do not certify those other boundaries.

## 2026-09-08 scoped host remediation and managed acceptance

This addendum supersedes the earlier conclusions that host administration, authentication, the nested sandbox, an external launcher or approved-route engineering tests are unavailable. The assessed clean source is `9a0372a123d1f038378bb6360806c139cfed2f61`; subsequent report commits describe that source. The protected release manifest was generated and verified without `--allow-dirty`. The external engineering signature binds that manifest to the four actual installed bundle hashes; its manifest SHA-256 is `b501ba838a7a48c4e93e5e103b8baf8f7a462bb97a51c40995764d4b61d4d462`. No actual organisation identifier, authentication volume, private signing key or recovery key is committed.

### Repairs and observed integration

- **P1 — nested user namespaces were denied.** Scoped Docker administrative helpers loaded a separate reviewed AppArmor profile; only those helpers received the specific administration capabilities. The application remains nonroot, read-only at its root and policy mount, with all outer capabilities dropped, no-new-privileges and enforced AppArmor/seccomp. No global Docker/AppArmor policy, shared-directory permissions or host sysctl was weakened. Neither privileged application mode nor `enableWeakerNestedSandbox` was used.
- **P1 — a passing standalone bubblewrap probe did not make actual managed Bash work.** The exact client sandbox helper hid the shell/loader through merged-/usr aliases under strict `denyRead: ["/"]`. A derived image replaces only the four top-level aliases with byte/metadata-verified copies. All 3,777 affected entries were checked and executable hashes were preserved. The exact embedded helper required two further narrowly observed namespace/mount operations. Final actual managed Bash ran successfully; earlier ENOENT/EPERM evidence is retained. Rebuild from an updated base for upgrades rather than running in-place package upgrades in this image.
- **P1 — default proc masking prevented the required fresh proc mount.** Selective Engine masking and an AppArmor equivalent of the removed proc read/write restrictions permit the required topology while retaining protected-path denials, including oldroot aliases. The exact embedded helper passed 31 controls; `/proc/sched_debug` and `/proc/timer_stats` were absent on this kernel and could not be exercised. Actual protected-file, socket, setuid/capability and namespace escalation attempts were denied. Inner namespace bounding capability bits are not host privileges; effective/permitted/inheritable/ambient sets remain zero and actual escalation controls pass.
- **P1 — approved proxy configuration alone left a DNS bypass.** An isolated target namespace now has default-drop IPv4/IPv6 firewall rules and only the exact proxy address/port. Docker's resolver DNAT initially bypassed the port-only rule; blocking `127.0.0.11` before established traffic and permitting only exact `127.0.0.1` loopback closed it. Twelve real direct/proxy/DNS attempts pass. The separate restricted CONNECT proxy permits only the four documented service hosts on 443, rejects private destinations and logs no request contents. Proxy outage blocks traffic; recovery was executed.
- **P1 — installed Skill path was incorrect in documentation.** Corrected the managed installation to `/etc/claude-code/.claude/skills/ai-policy-compliance/SKILL.md` in commit `9a0372a`. The actual managed Skill tool invoked that file and returned the intended expert-report refusal. Actual account-bound managed settings and hook SessionEnd filing were observed using the existing privately authenticated home, without copying credentials.
- **P1 — shared writable ancestors were unsuitable for trust controls.** The final launcher, key, bundle and selected matter live beneath protected host ancestors, with only the selected matter and read-only bundle mounted into the application. Existing shared directories were left unchanged. Test signing material stays outside application mounts. The external verifier refuses missing, modified or unsafe controls and unsupported launch requests. This establishes engineering integrity against the protected trust root, not a practice-approved release signature.
- **P2 — process exit alone could falsely accept a model session.** External session validation now pairs actual tool calls/results, rejects tool errors in positive scenarios, requires the expected tool/output and independently reads persisted output. Regression cases reject missing tools, missing results, tool errors, marker-only prose and mismatched persisted bytes. Actual managed boundary tests also assert tool denial/success separately from process exit.
- **P2 — a valid subsequent session was refused as an unprotected control path.** The controller incorrectly applied immutable-control permissions to the intentionally mutable canary. A bounded, stable fixture reader anchored beneath the protected selected matter now rejects symlinks/special files and invalid ownership/size while retaining strict checks for actual controls. The original data mode and signed manifest are unchanged. All 38 lifecycle regressions and seven actual lifecycle steps passed after the repair.
- **P2 — managed encrypted recovery lacked executed evidence.** An actual managed SessionEnd archive was encrypted with AES-GCM, only its ciphertext was copied to a separate Windows machine and returned, then a restore matched the source hash. Seven checks include tamper/wrong-key rejection before publication, cross-UID denial and original preservation. Recovery-key custody after losing the source host remains MVP-03.

Final image: `sha256:80afdbd51b7e3d3e6fe04c2e52f8dcfd3cd1e75182e7bddb9f637d8d20be0cef`, Claude 2.1.263, Node 22.23.2, bubblewrap 0.8.0. Named enforced AppArmor source SHA-256: `0630118144fe3f4304e552df6151bdc070e1507e60b1f80ef3baea3e7563b85a`; seccomp source SHA-256: `8b94fcccdb599de24c74a4730e387b26e41f37eab39b73f124278f25b6ae20f8`. Their exact source/build/load evidence and executable commands are retained outside Git and indexed by the [runbook](synthetic-container-checks.md). These results do not certify other hosts or image/client updates.

### Executed managed checks

In the commands below, `MVP_ROOT` is the protected acceptance installation documented in the external launcher runbook. External test scripts are retained there; they are not advertised as shipped repository commands.

| Executed command or actual path | Result and evidence |
|---|---|
| Protected launcher `test-launcher.py` | 94 verifier checks passed, zero failures/skips; real missing-primitive/profile probes supplement synthetic request tests. |
| Protected launcher `test-controlled-run.py` | 38 lifecycle/result checks passed, zero failures/skips after the mutable-fixture follow-up. Docker/model mutations in this regression suite are mocked and do not substitute for the following actual runs. |
| `python3 "$MVP_ROOT/launcher/controlled-run.py" create` | Created only the signed target; effective confinement, protected mounts, exact firewall and all 12 network denials passed before model startup. |
| `python3 "$MVP_ROOT/acceptance/live-managed-check.py" --container mvp-signed-managed-20260908 --mode normal --output "$MVP_ROOT/acceptance/live-signed-normal"` | 49 passed, zero failed. Actual own-matter Read/Write, cross-matter Read/Grep/Glob, Bash/interpreter routes, sensitive-path/protected-write and network denials, synthetic environment scrub canary, persistence and exact-session archive pass. Live host observer saw zero sibling inode opens/reads; its before/after positive controls passed. |
| Signed smoke, roundtrip, restart, preexisting-state read, second roundtrip and final verify | Seven recorded steps passed at `launcher/acceptance-runs/20260908T040710Z/results.json`. The preexisting 24-byte marker was read immediately after restart and before rewrite; SHA-256 remained `15e586954d3c598fefb83c0177aaedd3604f81371efff29f66ff854a73ec4935`. Each guarded step retained all 12 network denials and confinement checks. |
| Earlier actual normal and sabotaged-guard managed runs | Each 44 passed plus five additional assertions on saved tool results, zero failed. In the sabotage run the guard deliberately allows access; the kernel boundary still denies it and the observer sees zero sibling inode events. The sabotage container is stopped and disconnected. |
| Managed CLI with both bubblewrap aliases masked in a disposable target | Exit 1 before model initialization, with no successful unprotected tool result. `failIfUnavailable` remains enforced; the negative candidate is stopped/disconnected. |
| Exact embedded helper under final profiles | 31 passed, zero failed; two kernel files absent as identified above. No unconfined application or global profile bypass. |
| Restricted-egress probes and proxy stop/recovery | 12 denied routes passed, including direct IPv4/IPv6, host gateway, external/Docker TCP/UDP DNS and proxy host/port tricks. Proxy outage timed out (curl exit 28), then permitted service traffic recovered. |
| Actual managed Skill and SessionEnd | Skill invocation and expected expert-report refusal passed; archived JSONL tied to the actual session and source hash. |
| Encrypted archive independent-machine round trip | 7 passed, zero failed. Source hash `744219f4a1ed280be44327f819185e3fd332c34dfef2e207e5a117eca9005503`; ciphertext hash `06df115e7d239c729452f777442b7d3e201da8149ad875eb233070407ba65094`. The key stayed on the source host; no disaster-recovery/key-escrow acceptance is claimed. |
| Clean release-manifest generation and `--verify`, without `--allow-dirty` | Both exit 0 for source `9a0372a`; installed bundle equality checked by the external signed launcher. |
| Real production preflight with installed hook/settings and explicit real evidence root | Exit 1 with exactly 73 unresolved governance errors; no missing-path/origin configuration errors. Telemetry-disabled warning remains. The synthetic fixture preflight passes independently; real owner rows were not populated to turn this refusal into a pass. |

A diagnostic initially emitted short-lived local sandbox proxy credentials in exec arguments. That session ended and its former container was stopped/disconnected. The saved trace was replaced with an allowlist of filesystem/namespace arguments; later diagnostics filtered in memory before output or persistence. No account OAuth key was read or copied. AGENTS now explicitly forbids retaining full argv/environment diagnostics.

The [operational register](operational-evidence-register.md) links the observations for owner review and retains unresolved responsible-owner fields. The remaining blockers are interactive onboarding/status, actual confidential-use adoption and records/key-custody facts; the technical absence of a sandbox, login, launcher, installed policy or live records drill is no longer a blocker.

### Interactive startup and installation diagnostics

`python3 "$MVP_ROOT/launcher/controlled-run.py" interactive` was actually attempted through a PTY. The verified entry reached first-run theme and preselected subscription OAuth, not the `/status` panel. A subsequent filtered `claude auth status --json` still returned loggedIn=true and authMethod=claude.ai. Inspection of the installed client explains the distinction: ordinary browser `claude auth login` does not complete interactive onboarding, which includes OAuth, explicit security notes and optional terminal setup, followed separately by workspace trust. The completion flag was not changed. This remains MVP-04; it is not reported as a passed UI check.

Raw terminal output was kept only in memory and not retained. The incomplete interactive processes were cleared through a controlled restart, which again verified confinement and all 12 network denials; the earlier bridge authentication harness was stopped while its private home volume was preserved. Safe observations are in `acceptance/interactive-status-final.json`.

`docker exec mvp-signed-managed-20260908 claude doctor` exited 0, detected npm-global 2.1.263 and reported one Linux sandbox glob warning plus stored install-method metadata of unknown. These are not the earlier harness's warning-free diagnostics. Installed runtime source expands Read-deny globs against existing paths; it cannot dynamically cover a matching file created during the same Bash command. The generic warning does not mean every Read rule is ignored. All four protective deny rules remain; do not stage secrets inside a permitted synthetic matter or treat filename globs as a replacement for the tested outside-matter boundary. The unknown stored installation method is separate from the detected pinned executable. Safe diagnostics are in `acceptance/doctor-final-summary.json`.

### Final repository delivery verification

After the host/runbook reconciliation, `python scripts/verify.py` was executed with the repository's hash-installed Python 3.12.3 environment and Node 22.23.2: exit 0, all 12 offline Node suites (718 assertions), eight Python link regressions, zero failures and zero Linux skips. All 75 repository Markdown links resolve. Dependency consistency, syntax, schema/hash, DOCX parity, references, history/Office scanning, synthetic production preflight and manifest checks passed through that runner. Full output is retained privately at `acceptance/final-repository-verify.log`, SHA-256 `7a6e3c5c65e5a445cfbb8328d3f9510c0011fc077ebc9c04520df8207eea74e6`.

`python -W error tests/verify-local-links.test.py` separately passed eight cases; `git diff --check` passed after removing Markdown hard-break whitespace. The initial ad-hoc invocation of a nonexistent standalone `scripts/verify-local-links.py` was corrected to the actual `scripts.verify.local_links` function, which passed all 75 links; no such nonexistent command is documented as supported. All 44 original audit IDs remain present exactly once in the current reconciliation. That precommit result covered the then-committed history; the subsequent CI discovery and scanner correction below supersede its pending-change coverage. Final documentation is checked again by [PR 23 CI](https://github.com/jakelawllm/claude-settings/pull/23/checks).

Outstanding or unavailable checks are explicit: interactive `/status` awaits the normal owner OAuth/security-notes sequence; real governance preflight still refuses 73 incomplete fields; two proc files do not exist on this kernel; original-host/key-loss recovery has not been accepted or demonstrated. Optional credentialed GitHub automation remains disabled. There is no database/migration, web server/build, separate linter/type checker or formatter command to report as passed. Earlier Windows-only platform skips remain historical; none were skipped in this final Linux suite.

### CI regression and pending-change scanner correction

[CI run 34186992351](https://github.com/jakelawllm/claude-settings/actions/runs/34186992351) at `0c6d11e` failed its secret-scan and settings/policy jobs. All flagged values were verified public commit/artifact digests in the new evidence documents. The precommit runner had scanned committed history, so those then-uncommitted references were outside its scope. The original failed run and initial verification log remain preserved.

Commit `a6e28e079a0b` fixes that gap. The text scanner's `--worktree` mode checks staged and unstaged changes independently and Git-listed nonignored new text. The Office scanner separately checks staged blobs and Git-selected current/new Office files, replacing recursive discovery that could enter ignored runtime directories. Both refuse incomplete Git/read states, avoid following untrusted symlinks and retain redacted failure output. A staged disclosure removed only from disk is still detected. Force-staged ignored files remain candidates; ignored private runtime trees are not traversed.

Nine exact public references were independently verified against their commit objects, Docker identity or protected artifact bytes. Their exceptions apply only to the exact token, named evidence-document paths and entropy label; no arbitrary hexadecimal string, neighbouring secret, credential-shaped match or whole document is exempted. The standard runner and dedicated CI scan use the new modes. Both scanner regression suites now run in the existing Linux/macOS/Windows jobs, in separate steps so a later PowerShell command cannot hide an earlier failure.

| Executed corrected check | Result |
|---|---|
| `node tests/scan-history.test.js` with the venv Python selected | 106 passed, 0 failed, 0 skipped on Linux. |
| `node tests/scan-docx-xml.test.js` with the venv Python selected | 54 passed, 0 failed, 0 skipped on Linux. |
| `python scripts/verify.py` after both corrections | Exit 0; 12 Node suites, 788 assertions, eight Python regressions, 75 local links, zero failures/Linux skips. Evidence: `acceptance/verify-pending-scans-20260908.log`; the earlier log was not overwritten. |
| `python scripts/scan-history.py --worktree` after staging the complete fix | Exit 0; committed history, index and working files checked. |
| `python scripts/scan-docx-xml.py --history --worktree` after staging | Exit 0; two working Office files, two independent index blobs and eight historical blobs checked. |
| `git diff --cached --check` | Exit 0. |

Regression cases include staged-only and new disclosures, clean/deleted working copies that differ from the index, ignored-runtime pruning, explicitly tracked ignored paths, symlink and parent-path refusals, hostile filenames, malformed/unreadable Git states and redaction. Unavailable Windows symlink creation is explicitly counted if encountered; Linux exercised every new case. Final cross-platform results are attached to [PR 23 checks](https://github.com/jakelawllm/claude-settings/pull/23/checks).

Only verification tools, their CI wiring and documentation changed after the managed deployment source. Its installed control and generator/renderer bytes remain unchanged; the signed runtime evidence retains its original source and manifest instead of being relabelled as a newly deployed release. Interactive onboarding and actual confidential-use adoption remain the only recorded external blockers.
