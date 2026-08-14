# Policy decision: OAuth token management for Claude workflows

## Status

APPROVED FOR INTERNAL BETA ONLY — Option B (static-token exception) complete, 2026-08-14.

The owner selected Option B over Option A because this repository has not completed or approved the one-time Anthropic Workload Identity Federation setup required for a direct GitHub OIDC → Anthropic short-lived identity flow. The static `CLAUDE_CODE_OAUTH_TOKEN` therefore remains in use for this internal beta. Current Claude Code Action documentation describes federation using an Anthropic federation rule ID, organisation ID and service-account ID, with audience `https://api.anthropic.com`; those identifiers and Console setup evidence are not present here.

Every Option B operational field below is non-PENDING. This closes the SUP-05 exception for **internal beta use only**. It does **not** authorise a production go for external or client use: supplier register, legal-source register, data-flow sign-off, live E2E and OS isolation remain waived or blocked for production, and the README beta disclaimer still applies.

## Requirement

SUP-05 requires the release to use short-lived workload identity where available, or to record an approved exception for any long-lived OAuth token with a rotation and revocation plan.

## Current repository position

The interactive `Claude Code` workflow is read-only against GitHub (`contents: read`, `pull-requests: read`, `issues: read`, `actions: read`) and can respond only when explicitly invoked with `@claude`. It still authenticates to Claude Code with `CLAUDE_CODE_OAUTH_TOKEN` from GitHub secrets.

The unpinned automated `claude-code-review` workflow has been removed. If automated review is reintroduced, it must be vendored or pinned, read-only, restricted to trusted actors or labels, and human-review only.

## Decision required (closed at option level)

The responsible owner chose one of:

**Option A — migrate to short-lived workload identity:**
Replace the static OAuth token with a supported short-lived identity flow. Record the provider, audience, permissions, token lifetime and revocation path. **Not chosen for this beta** — direct Anthropic Workload Identity Federation is documented, but this repository has not completed or approved the required Anthropic Console issuer, service-account and federation-rule setup.

**Option B — approve a static-token exception for internal beta only:**
Keep `CLAUDE_CODE_OAUTH_TOKEN` only if all of the following are recorded:

1. token owner;
2. storage location;
3. minimum permissions;
4. rotation interval;
5. last rotation date;
6. next rotation date;
7. emergency revocation procedure;
8. monitoring owner; and
9. migration trigger for short-lived identity.

**← chosen; operational fields filled 2026-08-14.**

## Decision record

- **Decision:** Option B — static-token exception (internal beta only)
- **Decided by:** jacobcd123
- **Date:** 2026-08-12 (option); operational fields completed 2026-08-14
- **Rationale:** Direct Anthropic Workload Identity Federation is available, but this repository has not completed or approved the required Anthropic Console issuer, service-account and federation-rule setup. Static-token exception retained for internal beta until that setup is approved and verified.
- **Token owner:** jacobcd123
- **Storage location:** GitHub Actions repository secret `CLAUDE_CODE_OAUTH_TOKEN` (name only; secret value never recorded)
- **Minimum permissions:** static-token authentication needs `contents: read`, `pull-requests: read`, `issues: read` and `actions: read`; job runs only when `@claude` is present in the triggering comment/body/title (see `.github/workflows/claude.yml`). Current workflow also grants `id-token: write`, which is unused by Option B and is not part of the minimum; workflow remains unchanged for this decision.
- **Rotation interval:** 90 days
- **Last rotated:** never rotated
- **Next rotation due:** 2026-08-14 (due immediately on 2026-08-14; rotate on or before this date, then every 90 days from the rotation date)
- **Emergency revocation procedure:** (1) Disable the `Claude Code` workflow under Actions to stop new runs while the incident is handled. (2) Token owner revokes the old Claude Code OAuth token at the Claude/Anthropic account that issued it. (3) Confirm issuer-side revocation from the issuing account or by an issuer-safe rejection check that does not print or store the token value. (4) In the GitHub repository, open Settings → Secrets and variables → Actions and either replace `CLAUDE_CODE_OAUTH_TOKEN` with a new value or delete the secret. (5) Test only the replacement token by invoking `@claude` on a test issue/PR and verifying the workflow authenticates with the new secret. (6) Re-enable the workflow only after the old token is revoked and the GitHub secret has been replaced or deleted. Never paste the secret value into issues, PRs, logs, or this repository. Claude Code Action guidance: store credentials only as GitHub secrets; rotate regularly; do not hardcode or log secret material.
- **Monitoring owner:** jacobcd123
- **Migration trigger:** Completion and approval of Anthropic Workload Identity Federation for this repository — issuer registered, service account and federation rule created, repository claims restricted, audience set to `https://api.anthropic.com`, and IDs recorded — at which point re-open Option A and remove the static secret dependency from `.github/workflows/claude.yml`.

## Owner packet (filled)

| Field | Required for | Owner supplies |
|---|---|---|
| Chosen option | A or B | `B` (static-token exception) — filled |
| Decided by | both | jacobcd123 — filled |
| Date | both | 2026-08-12 (option); operational fields 2026-08-14 — filled |
| Rationale | both | Direct Anthropic Workload Identity Federation exists, but required Anthropic Console setup is not completed or approved. Static token retained for internal beta. — filled |
| Provider / audience / lifetime / revocation path | **A only** | N/A (Option A not chosen) |
| Token owner | **B only** | jacobcd123 — filled |
| Storage location | **B only** | GitHub Actions secret `CLAUDE_CODE_OAUTH_TOKEN` (name only) — filled |
| Minimum permissions | **B only** | Static token: `contents`/`pull-requests`/`issues`/`actions`: read; `@claude` trigger only. Current workflow also grants unused `id-token`: write; not minimum; workflow unchanged — filled |
| Rotation interval | **B only** | 90 days — filled |
| Last rotated / next rotation due | **B only** | never / 2026-08-14 (due immediately on 2026-08-14; rotate on or before this date, then +90 days) — filled |
| Emergency revocation procedure | **B only** | disable workflow → revoke old token at issuer → confirm issuer-side revocation without exposing token → replace/delete GitHub secret → test replacement token only → re-enable workflow — filled |
| Monitoring owner | **B only** | jacobcd123 — filled |
| Migration trigger | **B only** | Anthropic Workload Identity Federation setup completed and approved with repository-restricted claims and audience `https://api.anthropic.com` → migrate off static secret — filled |

**After Option A is recorded, engineering must:** implement the chosen short-lived identity flow in `.github/workflows/claude.yml`, remove the long-lived secret dependency, and document the provider in this file.

**After Option B is fully recorded (every field non-PENDING):** keep `CLAUDE_CODE_OAUTH_TOKEN` only while the fields above remain accurate, and schedule the recorded rotation. **Operational fields filled 2026-08-14.** First rotation is due immediately on 2026-08-14 (`never rotated`); token owner should rotate on or before the next-rotation-due date and update **Last rotated** / **Next rotation due** after each rotation.

SUP-05 static-token exception is complete for internal beta. Production go for external/client use remains blocked by other owner-dependent gates (registers, data-flow, E2E, OS isolation) and by the README beta disclaimer.
