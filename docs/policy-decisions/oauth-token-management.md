# Policy decision: OAuth token management for Claude workflows

## Status

PENDING — awaiting decision from the repository and security owner.

No production go is permitted while a workflow depends on a long-lived `CLAUDE_CODE_OAUTH_TOKEN` unless an owner has approved and recorded an exception, or the workflow has been migrated to a short-lived identity mechanism.

## Requirement

SUP-05 requires the release to use short-lived workload identity where available, or to record an approved exception for any long-lived OAuth token with a rotation and revocation plan.

## Current repository position

The interactive `Claude Code` workflow is read-only against GitHub (`contents: read`, `pull-requests: read`, `issues: read`, `actions: read`) and can respond only when explicitly invoked with `@claude`. It still authenticates to Claude Code with `CLAUDE_CODE_OAUTH_TOKEN` from GitHub secrets.

The unpinned automated `claude-code-review` workflow has been removed. If automated review is reintroduced, it must be vendored or pinned, read-only, restricted to trusted actors or labels, and human-review only.

## Decision required

The responsible owner must choose one of:

**Option A — migrate to short-lived workload identity:**
Replace the static OAuth token with a supported short-lived identity flow. Record the provider, audience, permissions, token lifetime and revocation path.

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

## Decision record

- **Decision:** PENDING
- **Decided by:** PENDING
- **Date:** PENDING
- **Rationale:** PENDING
- **Token owner:** PENDING
- **Rotation interval:** PENDING
- **Last rotated:** PENDING
- **Next rotation due:** PENDING
- **Emergency revocation owner:** PENDING
