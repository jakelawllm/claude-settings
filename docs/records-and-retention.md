# Records and retention

## What the hook archives

On SessionEnd, hooks/matter-guard.js copies the Claude Code session transcript (a JSONL file) into the matter folder under a subfolder named `_ai-record` (or a configured central archive). This is a convenience copy.

## Status and limitations

The hook's transcript archive is **not** a records system. It has these known limitations:

- **Archive failure is non-fatal:** if the archive write fails, the session ends normally and the failure is reported only as a system message visible to the model. No operational alert is raised.
- **No encryption:** transcripts are stored as plain JSONL files with no encryption at rest beyond what the underlying filesystem provides.
- **No retention lifecycle:** there is no automated deletion, legal hold, or matter-closure processing.
- **No integrity verification:** no hash is recorded; a transcript could be modified after archival without detection.
- **No access control beyond filesystem:** any user with access to the matter folder can read transcripts.

## What a production deployment must add

A practice deploying this repository for production confidential-matter use must implement:

1. **Supervised archival service:** a process that monitors archive success/failure and raises operational alerts on failure.
2. **Encryption at rest:** transcripts contain client matter communications and should be encrypted.
3. **Retention schedule:** a records schedule covering Claude local history, matter archives, and telemetry.
4. **Legal hold:** ability to suspend deletion for matter files subject to litigation hold.
5. **Access logging:** audit trail for who accessed which transcript.
6. **Integrity hashing:** SHA-256 hash recorded at archive time and verified on access.

## Telemetry

The managed settings route OTEL metrics and logs to the firm's collector. This records metadata (session occurred, tool counts, token counts) — **not** prompt or response content. See managed-settings.json for the configuration.

## What is *not* a records system

Telemetry metrics and tool events are not a verbatim evidentiary record. The JSONL transcript in the matter archive may be the closest available record of what was sent and received, but it is subject to the limitations above.
