# Data-flow model

This document is the approval framework for the controlled data-flow observation required before production release. It is not yet an approval. It records what must be observed and signed off by privacy, security and records owners.

## Status

OWNER APPROVAL REQUIRED — no production go until the controlled observation has been run on the release bundle and all owner sign-offs below are complete.

## Controlled observation scope

The observation must use a synthetic matter and the rendered production managed settings for the release candidate. It must record:

1. prompt entry and transmission to the Claude API;
2. model response and local display;
3. tool calls and tool result handling;
4. cross-matter refusal by the hook and by OS isolation where applicable;
5. local transcript storage and `SessionEnd` convenience archive;
6. telemetry emitted to the configured OTEL collector;
7. supplier retention and non-training position verified from the supplier register; and
8. handoff to the external records service.

## Expected flow to verify

### 1. Prompt entry

- **Source:** User input in Claude Code.
- **Data:** Prompt text and selected session context.
- **Destination:** Anthropic Claude API through the practice account.
- **Transport:** HTTPS/TLS.
- **Evidence required:** Network capture or supplier/API logs confirming destination and account context.

### 2. Model response

- **Source:** Anthropic Claude API.
- **Data:** Response text and tool-use requests.
- **Destination:** Claude Code client.
- **Evidence required:** Session transcript and local observation showing response receipt.

### 3. Tool execution

- **Source:** Claude Code tool engine.
- **Data:** Local file paths, tool inputs and tool outputs.
- **Boundary:** `hooks/matter-guard.js` binds the session to one matter for registered tools; the OS sandbox supplies the Bash boundary.
- **Evidence required:** Successful same-matter read and refused cross-matter read in a synthetic matter test.

### 4. Session transcript

- **Source:** Claude Code local transcript.
- **Data:** JSONL transcript including prompts, responses, tool calls and tool results.
- **Destination:** local Claude Code history and matter `_ai-record` convenience copy or configured central archive.
- **Evidence required:** `SessionEnd` archive path, file permissions and transcript hash.

### 5. Records service handoff

- **Source:** Matter archive convenience copy.
- **Data:** Transcript and archive event metadata.
- **Destination:** external records service.
- **Boundary:** Repository responsibility ends at the documented handoff. The records service owns durable storage, encryption, legal hold, deletion, access logging and alerting.
- **Evidence required:** accepted archive event or a deliberately triggered monitored failure.

### 6. Telemetry

- **Source:** Claude Code telemetry.
- **Data:** Metadata such as session occurrence, token counts and tool counts. Prompt and response content must remain redacted unless the practice deliberately enables content gates.
- **Destination:** practice OTEL collector.
- **Evidence required:** collector event sample showing metadata fields and absence of prompt/response content.

### 7. Supplier retention

- **Source:** Anthropic service handling prompts and responses.
- **Data:** API request and response content and operational metadata.
- **Destination:** supplier systems under the practice account terms.
- **Evidence required:** supplier evidence register completed by a responsible owner.

## Approval sign-off

- [ ] Privacy owner reviewed the observed flow and confirmed personal-information handling is acceptable.
  - **Name:** OWNER-REQUIRED
  - **Date:** DATE-REQUIRED
  - **Evidence:** EVIDENCE-REQUIRED

- [ ] Security owner reviewed the observed flow and confirmed sandboxing, hook behaviour, access control and encryption boundaries are acceptable.
  - **Name:** OWNER-REQUIRED
  - **Date:** DATE-REQUIRED
  - **Evidence:** EVIDENCE-REQUIRED

- [ ] Records owner reviewed the observed flow and confirmed archive, retention, legal-hold, deletion and access-log responsibilities are clear.
  - **Name:** OWNER-REQUIRED
  - **Date:** DATE-REQUIRED
  - **Evidence:** EVIDENCE-REQUIRED

## Release gate

A release candidate is blocked until this file records the observed release bundle hash, the controlled session evidence and all three owner approvals.
