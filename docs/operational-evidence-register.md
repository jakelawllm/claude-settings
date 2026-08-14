# Operational evidence register

This register records completion references for manual, host-dependent and external-service gates. It does not contain operational evidence or identifying host, matter or operator detail. Where evidence is confidential or identifying, record only a controlled reference to the external evidence archive.

## How to use this register

1. A responsible owner must complete each row after the underlying check or review has occurred.
2. Record the owner's name, completion date and a controlled evidence reference. Do not paste confidential evidence into this repository.
3. Keep the evidence reference usable by an authorised reviewer and subject to the practice's retention and access controls.
4. Entries containing `OWNER-REQUIRED`, `DATE-REQUIRED` or `EVIDENCE-REFERENCE-REQUIRED` are deliberately unresolved and block production release until completed by a responsible owner.

Preflight validation checks that a completion record exists; it does not independently establish that the underlying observation passed. The host-dependent OS-isolation procedure remains governed by `docs/os-isolation-acceptance.md`, and the external records-service obligations remain governed by `docs/records-schema.md`.

## Entries

| Gate | Category | Required input | Owner | Date | Evidence reference |
|---|---|---|---|---|---|
| `claude doctor` on each supported platform | Manual validation | Managed settings loaded and no managed keys stripped | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| `/status` in a real session | Manual validation | Managed settings and hooks confirmed in force | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Live E2E (`CLAUDE_E2E=1 node tests/e2e.test.js`) | Manual validation | Signed-in session and documented result on certified path | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Cross-matter refusal smoke test | Manual validation | Real refusal using rendered production settings | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Sandbox fail-closed check | Manual validation | `sandbox.failIfUnavailable` refusal confirmed in target environment | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| `SessionEnd` transcript filing check | Manual validation | Record reaches configured matter archive or central archive | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Native Windows platform exclusion | Manual validation | Native Windows is not treated as hard matter isolation | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Manifest signature verification | Manual validation | Installed bundle matches approved signed manifest | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Version compatibility review | Manual validation | Certified minimum and maximum versions reviewed and updated | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| OS-isolation acceptance | External operational evidence | Certified host observer, canary result and sabotaged-guard negative control | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Records-service confirmation | External operational evidence | Encryption, retention, legal hold, deletion, access logging and alerting confirmed | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |
| Independent security review | External operational evidence | Completed review or responsible-principal beta waiver, as applicable | OWNER-REQUIRED | DATE-REQUIRED | EVIDENCE-REFERENCE-REQUIRED |

## Scope

Completion of this register does not itself authorise production go. The production preflight, release checklist, README beta disclaimer and all other governance registers remain controlling. Internal-beta waivers do not satisfy production requirements.
