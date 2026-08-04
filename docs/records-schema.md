# Session archive record schema

## Purpose

This document defines the handoff contract between `hooks/matter-guard.js` and an external records service.

The hook makes a convenience copy of the Claude Code JSONL transcript at `SessionEnd`. The repository owns the naming rules, schema, validation expectations and handoff documentation. It does not own production storage, encryption, retention, legal hold, deletion, alerting or access logging. Those responsibilities belong to the external records service and the practice's records systems.

## Record structure

One session archive event is represented as JSON:

```json
{
  "version": "1.0",
  "matter_id": "matter:/matters/clients/Smith",
  "session_id": "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  "timestamp_start": "2026-08-03T14:00:00Z",
  "timestamp_end": "2026-08-03T14:30:00Z",
  "hook_hash": "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  "settings_hash": "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  "policy_hash": "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  "transcript_hash": "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  "transcript_size_bytes": 54321,
  "transcript_path": "/matters/clients/Smith/_ai-record/session-2026-08-03T14-00-00-aabbccdd.jsonl"
}
```

## Field definitions

| Field | Type | Required | Validation |
|---|---|---:|---|
| `version` | string | Yes | Exactly `1.0` until this schema changes. |
| `matter_id` | string | Yes | Starts with `matter:` and resolves to one configured matter identity. Distinct roots with the same matter name are distinct. |
| `session_id` | string | Yes | Lowercase 64-character SHA-256 hex digest of the Claude Code session ID namespace used by the hook. Never the raw session ID. |
| `timestamp_start` | string | Yes | UTC ISO 8601 timestamp ending in `Z`. |
| `timestamp_end` | string | Yes | UTC ISO 8601 timestamp ending in `Z` and later than `timestamp_start`. |
| `hook_hash` | string | Yes | Lowercase 64-character SHA-256 hex digest of `hooks/matter-guard.js` in the installed bundle. |
| `settings_hash` | string | Yes | Lowercase 64-character SHA-256 hex digest of the rendered managed settings file. |
| `policy_hash` | string | Yes | Lowercase 64-character SHA-256 hex digest of the deployed policy or compliance-skill bundle. |
| `transcript_hash` | string | Yes | Lowercase 64-character SHA-256 hex digest of the archived transcript file. |
| `transcript_size_bytes` | integer | Yes | Greater than 0 and no more than 100,000,000 bytes. |
| `transcript_path` | string | Yes | Absolute POSIX path to the convenience transcript copy. It must not contain a `..` path segment. |

## Validation rules

A production records service must reject an archive event unless all of these conditions hold:

1. every required field is present;
2. `version` is supported;
3. all hash fields are lowercase 64-character hex strings;
4. timestamps are parseable UTC instants and `timestamp_start < timestamp_end`;
5. `transcript_size_bytes` is within the accepted range;
6. `transcript_path` is absolute, contains no traversal segment and ends in `.jsonl`;
7. `matter_id` resolves to the practice's matter registry;
8. the transcript exists at receipt time and its SHA-256 digest equals `transcript_hash`; and
9. a record for the same `session_id` has not already been accepted.

The hook does not perform every validation above. The hook is deliberately small and local; production validation and alerting live in the external service.

## Handoff contract

At `SessionEnd`, the hook attempts to copy the JSONL transcript to the configured matter archive path. If the copy succeeds, the external records service must treat that copy as an input queue item, not as a durable record.

The hook is responsible for:

- resolving the bound matter from the session state;
- avoiding a cwd-based fallback where the binding is corrupt;
- writing a convenience copy with explicit file permissions; and
- reporting archive failure to the session.

The records service is responsible for:

- consuming or observing archive events;
- validating the schema and hashes;
- encrypting and storing the transcript;
- applying retention, legal hold and deletion rules;
- logging access to the record;
- alerting when a session has no accepted archive event within the service-level threshold; and
- quarantining malformed events, including corrupt-binding events, with enough metadata for human investigation.

## Failure handling

A corrupt or missing session binding is a records gap, not an invitation to infer the matter from cwd. The hook must not silently file the transcript into a matter based only on cwd. The records service must surface that event for manual resolution.

An archive write failure is non-fatal to the Claude Code session. It is fatal to release readiness unless the external records service proves the failure is detected, alerted and resolved.

## Synthetic fixture

The fixture embedded in this document is intentionally synthetic. It may be copied into a test without introducing real matter identifiers, paths, users or hostnames.
