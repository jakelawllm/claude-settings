# Policy decision: OAuth token management for Claude workflows

## Status

PARTIALLY RESOLVED — Option B chosen (static-token exception for internal beta only), 2026-08-12.

The owner has selected Option B over Option A after it was established that a pure GitHub-OIDC → Anthropic short-lived identity flow is not a supported Claude Code Action path (short-lived OIDC credentials are documented only for AWS Bedrock, Google Vertex AI, or Microsoft Foundry). The static `CLAUDE_CODE_OAUTH_TOKEN` therefore remains in use for this internal beta.

**SUP-05 exception is not complete.** The Option B operational fields (token owner, storage location, minimum permissions, rotation interval, last/next rotation dates, emergency revocation procedure, monitoring owner, migration trigger) have not been supplied by the owner and remain PENDING. No production go for external/client use is permitted under SUP-05 until every Option B field below is non-PENDING, or the workflow is migrated to a supported short-lived identity path.

## Requirement

SUP-05 requires the release to use short-lived workload identity where available, or to record an approved exception for any long-lived OAuth token with a rotation and revocation plan.

## Current repository position

The interactive `Claude Code` workflow is read-only against GitHub (`contents: read`, `pull-requests: read`, `issues: read`, `actions: read`) and can respond only when explicitly invoked with `@claude`. It still authenticates to Claude Code with `CLAUDE_CODE_OAUTH_TOKEN` from GitHub secrets.

The unpinned automated `claude-code-review` workflow has been removed. If automated review is reintroduced, it must be vendored or pinned, read-only, restricted to trusted actors or labels, and human-review only.

## Decision required (closed at option level)

The responsible owner chose one of:

**Option A — migrate to short-lived workload identity:**
Replace the static OAuth token with a supported short-lived identity flow. Record the provider, audience, permissions, token lifetime and revocation path. **Not chosen** — attempted first as GitHub OIDC → short-lived Claude Code token; abandoned after Context7 documentation for Claude Code Action showed that path requires routing through AWS Bedrock, Google Vertex AI, or Microsoft Foundry, which this repository has not set up.

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

**← chosen at the option level; operational fields still PENDING.**

## Decision record

- **Decision:** Option B — static-token exception (internal beta only)
- **Decided by:** jacobcd123
- **Date:** 2026-08-12
- **Rationale:** Short-lived identity for Claude Code Action requires AWS Bedrock, Google Vertex AI, or Microsoft Foundry. No GitHub-OIDC-to-Anthropic direct flow is available. Static-token exception retained for internal beta until a cloud-provider identity path is adopted.
- **Token owner:** PENDING
- **Storage location:** PENDING
- **Minimum permissions:** PENDING
- **Rotation interval:** PENDING
- **Last rotated:** PENDING
- **Next rotation due:** PENDING
- **Emergency revocation procedure:** PENDING
- **Monitoring owner:** PENDING
- **Migration trigger:** PENDING

## Owner packet (partially filled)

Do not invent rotation owners, dates, or a migration design. The repository/security owner supplies real values; engineering only implements after that.

| Field | Required for | Owner supplies |
|---|---|---|
| Chosen option | A or B | `B` (static-token exception) — filled |
| Decided by | both | jacobcd123 — filled |
| Date | both | 2026-08-12 — filled |
| Rationale | both | Short-lived identity requires Bedrock/Vertex/Foundry; no GitHub-OIDC-to-Anthropic flow. Static token retained for internal beta. — filled |
| Provider / audience / lifetime / revocation path | **A only** | N/A (Option A not chosen) |
| Token owner | **B only** | PENDING |
| Storage location | **B only** | PENDING (secret name only; never the secret value) |
| Minimum permissions | **B only** | PENDING |
| Rotation interval | **B only** | PENDING |
| Last rotated / next rotation due | **B only** | PENDING |
| Emergency revocation procedure | **B only** | PENDING |
| Monitoring owner | **B only** | PENDING |
| Migration trigger | **B only** | PENDING |

**After Option A is recorded, engineering must:** implement the chosen short-lived identity flow in `.github/workflows/claude.yml`, remove the long-lived secret dependency, and document the provider in this file.

**After Option B is fully recorded (every field non-PENDING), engineering must:** keep `CLAUDE_CODE_OAUTH_TOKEN` only while every Option B field above is non-PENDING, and schedule the recorded rotation.

Until every Decision record field above is non-PENDING, no production go is permitted under SUP-05. Option B has been chosen; the exception itself is incomplete until the operational fields are supplied.
