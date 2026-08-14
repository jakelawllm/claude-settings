# Operational evidence register

Synthetic resolved operational evidence fixture for production preflight tests only.

| Gate | Category | Required input | Owner | Date | Evidence reference |
|---|---|---|---|---|---|
| `claude doctor` on each supported platform | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://doctor |
| `/status` in a real session | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://status |
| Live E2E (`CLAUDE_E2E=1 node tests/e2e.test.js`) | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://e2e |
| Cross-matter refusal smoke test | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://cross-matter |
| Sandbox fail-closed check | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://sandbox |
| `SessionEnd` transcript filing check | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://session-end |
| Native Windows platform exclusion | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://platform |
| Manifest signature verification | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://manifest |
| Version compatibility review | Manual validation | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://version |
| OS-isolation acceptance | External operational evidence | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://os-isolation |
| Records-service confirmation | External operational evidence | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://records |
| Independent security review | External operational evidence | Synthetic result | SYNTHETIC-FIXTURE | 2026-08-04 | synthetic://security |
