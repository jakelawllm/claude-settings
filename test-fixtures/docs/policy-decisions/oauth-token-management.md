# Policy decision: OAuth token management for Claude workflows

## Status

APPROVED FOR SYNTHETIC PRODUCTION TEST FIXTURE

## Decision record

- Decision: Option B — synthetic static-token exception
- Decided by: Synthetic Test Owner
- Date: 2026-08-04
- Rationale: Synthetic production validator fixture only.
- Token owner: Synthetic Test Owner
- Storage location: synthetic GitHub Actions repository secret name only
- Minimum permissions: contents, pull-requests, issues and actions: read
- Rotation interval: 90 days
- Last rotated: 2026-08-04
- Next rotation due: 2026-11-02
- Emergency revocation procedure: synthetic issuer revocation procedure
- Monitoring owner: Synthetic Test Owner
- Migration trigger: synthetic federation setup approved
