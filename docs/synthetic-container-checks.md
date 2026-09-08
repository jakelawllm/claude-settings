# Synthetic container checks and recovery

This runbook describes the controlled engineering environment tested on 2026-09-08. The nested sandbox, managed tool paths and encrypted synthetic-record recovery now work on the reviewed host. The final signed adapter has created its restricted target and passed the full 49-check managed harness; signed round-trip and restart verification also passed. Owner-completed interactive onboarding and `/status` remain required before the interactive MVP journey is accepted, as recorded below. These technical results do not approve confidential matters, retention policy or records ownership. See [architecture](production-architecture.md), [OS acceptance](os-isolation-acceptance.md) and [remaining issues](INTERNAL_MVP_REMAINING_ISSUES.md).

No container image or host launcher is distributed in this repository. The operator retains the pinned image, reviewed host profiles, launch scripts and full results in private evidence storage. Use the protected operator directory without embedding account identifiers in commands:

```sh
MVP_ROOT="$HOME/claude-mvp-acceptance-20260908"
```

## Current managed environment

The protected root contains `managed-bundle`, `matters/Smith`, `matters/Jones`, `launcher`, `egress`, `acceptance` and `records-recovery`. Its owner-only parent permissions protect the signing trust root and private evidence. The container receives the managed bundle read-only and only the selected Smith child matter; neither the protected parent nor Jones is mounted. The private authentication home is a separate persistent volume. Never add that home, a credential file, `.claude-orch/`, transcripts or local settings to a build context, source snapshot or Git. Select tracked source files explicitly.

| Candidate | Verified purpose and state |
|---|---|
| `mvp-signed-managed-20260908` | Final adapter-created target. Staging passed 12 egress checks before model use. Its subsequent full managed harness passed 49 checks, with no sibling inode events during denial probes and synthetic environment canaries scrubbed. The signed lifecycle then passed all seven steps, including independently checked persistence across restart. Owner-completed interactive onboarding and `/status` remain open below. |
| `mvp-managed-v5-20260908` | Earlier normal managed session: 44 checks and five additional tool-result assertions passed. Nonroot UID/GID 1000, read-only root and managed bundle, all outer capabilities dropped, no-new-privileges, reviewed named AppArmor/seccomp profiles, one matter and restricted proxy egress. Stopped and disconnected after its baseline run; the signed target supersedes it. |
| `mvp-managed-sabotage-20260908` | Separate disposable allow-all-guard negative control with the same OS boundary: 44 checks and five additional tool-result assertions passed. Never use this deliberately sabotaged guard for an ordinary session. |

The signed engineering manifest binds clean source candidate `9a0372a` and four installed-bundle hashes. Its SHA-256 is `b501ba838a7a48c4e93e5e103b8baf8f7a462bb97a51c40995764d4b61d4d462`. This operator-generated signature establishes artifact integrity against the protected trust root; it is not independent approval for confidential matters.

Inspect selected fields only; full container inspection can expose environment credentials. The following inspect commands work while the target is stopped:

```sh
MVP_CONTAINER=mvp-signed-managed-20260908
docker inspect --format '{{.Config.User}} {{.HostConfig.ReadonlyRootfs}} {{json .HostConfig.CapDrop}} {{.AppArmorProfile}}' "$MVP_CONTAINER"
docker inspect --format '{{range .Mounts}}{{.Destination}} writable={{.RW}}{{println}}{{end}}' "$MVP_CONTAINER"
```

Check the runtime UID, effective parent permissions and actual read-only mount flags together. Root-owned files can still be replaced through writable parents. Docker `--mount` uses `type=bind,src=CONTROLLED_BUNDLE,dst=/etc/claude-code,readonly`; appending `:ro` to its `dst` creates a different literal path. The `:ro` suffix belongs to the separate `-v` syntax. A matter root contains matter folders; the container mount is the selected child, not that parent.

## Resolved host and runtime compatibility failures

The original Docker-default probe failed at `clone(CLONE_NEWNS|CLONE_NEWUSER)` with `EPERM`. Ubuntu's AppArmor user-namespace capability restrictions independently prevented the required setup. Those failures are retained as historical evidence; they no longer describe the scoped managed candidate.

The reviewed host uses Docker Engine 29.8.0 on amd64, Linux 6.8 and AppArmor parser 4.0.1. The working image contains Node 22.23.2, Claude 2.1.263 and bubblewrap 0.8.0. The repository's Python 3.12 hash-locked verification environment remains separate from the image's system Python used for OS probes.

The fix preserves confinement:

- The seccomp policy starts from the exact Docker build's Moby profile and preserves its default-deny action and original rules. Additional amd64 rules match traced namespace flags and mount flags; `clone3` retains the default `ENOSYS` behavior.
- The named AppArmor profile permits the observed bubblewrap and embedded `apply-seccomp` mount topology. It retains protected `/proc` and `/sys` denials, including temporary root aliases and alias-bind prevention. No unconfined or privileged runtime is used.
- Docker's `/proc` submount masks prevented a fresh unprivileged proc mount. The scoped Engine API request removes those `/proc` submounts and applies equivalent explicit AppArmor read/write denials. The two `/sys` masks remain, along with read-only root, dropped outer capabilities and no-new-privileges. This is a selective path configuration, not `systempaths=unconfined`.
- The installed Claude read-filtering helper mishandles merged-`/usr` aliases: earlier `/lib` masks make later `/usr` restores fail, leaving the ELF loader unavailable. The derived image replaces only `/bin`, `/lib`, `/lib64` and `/sbin` top-level symlinks with verified copies of the existing public toolchain trees. Original executable hashes remain unchanged. A broad `/usr` read exception did not fix the actual client and is unnecessary in the working configuration.

| Final artifact | SHA-256 / identity |
|---|---|
| Derived image | `sha256:80afdbd51b7e3d3e6fe04c2e52f8dcfd3cd1e75182e7bddb9f637d8d20be0cef` |
| `claude-runtime-step7.draft.json` | `8b94fcccdb599de24c74a4730e387b26e41f37eab39b73f124278f25b6ae20f8` |
| `claude-apply-proc-compatible.apparmor` | `0630118144fe3f4304e552df6151bdc070e1507e60b1f80ef3baea3e7563b85a` |
| Loaded AppArmor name | `claude-mvp-bwrap-proc-review-20260908` |

The retained artifact filenames include development labels; use their hashes and the separately verified signed launch manifest to identify a deployment. Do not infer signing or owner approval from a filename.

The successful tooling read paths include `/bin`, `/lib/x86_64-linux-gnu`, `/lib64`, `/usr/bin`, `/usr/lib`, `/usr/local/bin`, `/usr/local/lib/node_modules` and the required public resolver/loader/certificate files, alongside the selected matter and managed bundle. The installed skill is under `/etc/claude-code/.claude/skills/ai-policy-compliance/SKILL.md`; the actual managed Skill invocation succeeded. Keep `denyRead` rooted at `/`, managed-only read paths and `failIfUnavailable` enabled. When both bubblewrap executable aliases were deliberately unavailable, the actual client exited 1 before model initialization and produced no unprotected tool result (`actual-fail-if-unavailable.json`).

The full native embedded helper was also invoked directly without authentication. Both fresh proc mounts returned 0; Bash, sh, Node, Python, SSL/ctypes and synthetic write/read operations succeeded. Its security probe passed 31 checks with zero failures; `/proc/sched_debug` and `/proc/timer_stats` were absent and remain two unavailable checks. Unix sockets, protected proc opens, immutable writes, UID0 and CAP_SYS_ADMIN acquisition were denied. IPv4 socket creation provided a positive control.

The outer container has zero inheritable, permitted, effective, bounding and ambient capability sets. The workload has zero usable capability sets and no-new-privileges. Its additional user namespace has a nonzero namespace-local bounding set, as specified by [Linux's user-namespace credential initialization](https://raw.githubusercontent.com/torvalds/linux/v6.8/kernel/user_namespace.c); the first overly strict bounding-set assertion is preserved as a failed probe and superseded by executed privilege-acquisition denial checks. Do not describe this as a host capability grant.

Rebuild the compatibility image from a patched merged base and rerun the complete acceptance suite when upgrading packages or Claude. Do not run in-place distribution package upgrades on the derived unmerged image; package management assumes the original filesystem layout. An image-only workaround cannot replace the reviewed host profiles.

## Actual managed acceptance and egress

The earlier normal and sabotaged sessions each passed 44 checks. The final signed target subsequently passed its full 49-check managed harness, with zero sibling inode events during the denial window and verified environment-canary scrubbing (`$MVP_ROOT/acceptance/live-signed-normal/result.json`). These include actual Read, Write, Grep, Glob and sandboxed Bash invocations; same-matter persistence; interpreter, archive, symlink, child/background-process and credential/socket denials; protected policy/kernel writes; direct IPv4/IPv6 denial; and actual managed SessionEnd archival. A host inotify observer had positive controls before and after the sibling-denial attempts. No sibling-canary bytes appeared in tool results.

Each session also passed five separate result assertions: Read, Grep and Glob returned actual denials; Write returned actual success; and the allowed same-matter canary was actually read. This distinguishes tool invocation from successful enforcement. Evidence is retained as `live-normal-v5/result.json`, `live-sabotaged/result.json` and each directory's `additional-result-assertions.json`.

After the DNS fix, `network/v2-network-result.json` passed all 12 egress checks: direct external IPv4/IPv6 and host-gateway access, wrong proxy port, external and Docker-embedded DNS over TCP/UDP, and proxy rejection of unapproved hosts, loopback targets, misleading hostname suffixes and an unapproved destination port. The model-backed managed session exercised the configured permitted service route. The signed adapter subsequently repeated all 12 checks successfully while staging its final target, before running a model session.

The retained public harness scripts were copied byte-for-byte into `$MVP_ROOT/acceptance`. After the verified launcher has prepared a fresh normal candidate with its probe file, run:

```sh
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
python3 "$MVP_ROOT/acceptance/live-managed-check.py" \
  --container "$MVP_CONTAINER" --mode normal \
  --output "$MVP_ROOT/acceptance/normal-$RUN_STAMP"
```

The output directory must be new. The harness is scoped to this retained synthetic host environment and spends model tokens. Use `--mode sabotaged` only against the separately prepared disposable negative-control target. Do not replace the normal target's guard. Preserve full results privately; do not print transcript or authentication bytes while extracting pass/fail summaries.

## Encrypted recovery of the actual managed archive

The normal managed session's exact hashed SessionEnd archive was backed up using a fresh AES-256-GCM key and authenticated metadata. Only ciphertext was transferred to an independent Windows device, its hash was checked there, and that ciphertext was returned under a fresh filename. The key remained private on the source host.

All seven recovery checks passed: independent ciphertext hash, authenticated plaintext equality, restored-file persistence/hash, tamper rejection before plaintext publication, wrong-key rejection, cross-UID denial of the key/restored record, and unchanged original archive. The source was a 38,371-byte synthetic record, SHA-256 `744219f4a1ed280be44327f819185e3fd332c34dfef2e207e5a117eca9005503`. Ciphertext SHA-256 was `06df115e7d239c729452f777442b7d3e201da8149ad875eb233070407ba65094`.

The private directory is mode 0700 and files are mode 0600. Evidence and exact executed commands are in `$MVP_ROOT/records-recovery/ENCRYPTED_MANAGED_ARCHIVE_DRILL.md`; `managed-archive-backup-drill.py` uses exclusive destination creation and refuses overwrites. Never copy its key or restored plaintext into Git or a transfer bundle.

This demonstrates restoration with a retained key, not recovery after losing the source host and key. Approved key escrow, retention/hold policy, supervised archival/alerting and records-owner acceptance remain separate requirements. The repository's convenience archive has not become an external records service through this drill.

## Earlier evidence, retained with its original scope

| Historical run | Executed result and limit |
|---|---|
| `mvp-acceptance` / `mvp-acceptance-phase4` | 35 offline checks passed with strace and inotify positive controls, including a copied allow-all guard. Network none; actual subprocess containment, not authenticated tool or approved-egress acceptance. |
| `records-drill/reproduce.py` | 40 direct-hook recovery checks passed, including interrupted writes, preserved-source retries and cross-UID denial. This preceded the actual managed archive/encrypted independent round trip above. |
| `mvp-auth-20260908` | Owner completed interactive login; the actual 2.1.263 client passed 13 E2E checks, six conduct samples and doctor exit 0 with no installation issues. This earlier harness used ordinary bridge egress without an installed managed bundle. It is now stopped; its private authentication volume is preserved. |
| Clean candidate `a55e88c` | Unsigned synthetic release manifest generated and verified without `--allow-dirty`. This was not a signed deployment or owner approval. |

Original containers ending in `-before-20260908` and the original synthetic-matter volume were preserved; the old containers are stopped. Their former root process, writable policy directories and malformed mount are not current containment evidence. The earlier failed Docker-default namespace probes and initial oracle failures remain in the private evidence history rather than being relabeled passed.

## Signed adapter operation and final checks

The external launch-verifier suite passed 94 checks, and its lifecycle/result-validation suite passed 38 checks, with zero failures and zero skips. The actual `controlled-run.py create` then created `mvp-signed-managed-20260908` and passed its 12 egress checks without invoking a model during staging. The final signed target then passed the full 49-check managed harness and the seven-step signed lifecycle sequence. These test-suite counts are distinct from the executed model and recovery observations below.

Use the protected adapter's entry points:

```sh
python3 "$MVP_ROOT/launcher/controlled-run.py" verify
python3 "$MVP_ROOT/launcher/controlled-run.py" session --prompt sandbox-smoke.txt
python3 "$MVP_ROOT/launcher/controlled-run.py" session --prompt same-matter-roundtrip.txt
python3 "$MVP_ROOT/launcher/controlled-run.py" restart
python3 "$MVP_ROOT/launcher/controlled-run.py" interactive
```

The two session commands spend model tokens. They require paired successful tool results and expected markers; the round-trip case also requires actual persisted write/read output. Interactive entry requires a real terminal, verifies the target first, uses normal CLI permission defaults and does not capture the interactive session through the controller. Observe `/status` there and retain account-bound evidence privately.

The executed signed lifecycle passed all seven steps: establish the existing persistence marker, signed Bash smoke, signed write/read round trip with independent readback, restart, read the preexisting marker after restart before any second write, a second signed round trip, and final verification. Each guarded step passed its 12 network-denial/confinement checks. The 24-byte marker remained unchanged across restart, SHA-256 `15e586954d3c598fefb83c0177aaedd3604f81371efff29f66ff854a73ec4935`. Evidence: `$MVP_ROOT/launcher/acceptance-runs/20260908T040710Z/results.json` (seven exit-zero steps).

An earlier lifecycle attempt refused `unprotected-control-path` because the verifier mistakenly treated the deliberately mutable synthetic canary as an immutable control file. The scoped classification fix retained checks on actual control files, added regression coverage and passed the full 38-check lifecycle suite before the seven-step real rerun. The original refusal is preserved in private evidence.

The final signed target's `claude doctor` exited 0 and identified the pinned npm-global 2.1.263 client. It reported one warning category about Linux sandbox Read/Edit glob rules, including `.env.*`, `*.pem` and `*.key`. The stored configuration's unknown install-method value is cosmetic metadata. The doctor result is not warning-free; the earlier warning-free result in the history table applies only to its separate harness.

Inspection of the installed runtime shows that Read-deny globs expand against files existing when a Bash sandbox is constructed. They do not cover files created later during that same Bash command. Retain all four configured deny rules, but do not treat them as a complete file-extension boundary. Never stage credentials or private keys inside the selected Smith matter. The tested boundary keeps credential homes, host sockets and other matters outside its strict read allowlist; this run used synthetic matter data only.

## Required owner action: interactive onboarding and status

**Still open:** `/status` was not observed. The actual final target remains authenticated for its verified headless sessions, but interactive entry reaches theme selection and the preselected subscription OAuth flow. This is not evidence of lost authentication or a cold-host test. The installed source confirms that `claude auth login` does not set `hasCompletedOnboarding`; normal onboarding separately requires security-note acknowledgement, optional terminal setup and subsequent directory trust. Do not set the onboarding flag or otherwise skip those screens.

From a real terminal, connect to the acceptance host (replace the placeholders with the operator's existing SSH target):

```sh
ssh -t USER@ACCEPTANCE_HOST
```

Then, in that remote terminal:

```sh
MVP_ROOT="$HOME/claude-mvp-acceptance-20260908"
python3 "$MVP_ROOT/launcher/controlled-run.py" interactive
```

Complete the normal OAuth, security and trust flow directly in that terminal. Keep codes, account identifiers and tokens out of chat, shared logs and Git. Run `/status` in the resulting Claude session and compare its installed version, managed-settings source, intended account/organisation and current synthetic-matter context with the protected release configuration. Record the observed result privately before marking interactive acceptance complete. No `/status` pass or completed interactive journey is inferred from the headless suites. Sanitized final observations are retained as `$MVP_ROOT/acceptance/interactive-status-final.json` and `doctor-final-summary.json`. After these observations, another adapter restart passed confinement and all 12 egress checks; no leftover Claude processes remained. The earlier v5 candidate remains stopped/disconnected, and the ordinary-bridge authentication harness is stopped with its private home volume preserved.

Resume or recreate through the verified launcher using its retained operator instructions and pinned manifest. A raw `docker start` does not rerun signature, trust-root or egress setup checks. Preserve authentication state and source/restored archives during recovery; do not delete old containers, volumes or partial records to clear a failure. Diagnose using selected state fields and scoped kernel/AppArmor denials, then rerun the affected probes. Never disable `failIfUnavailable`, enable a weaker nested sandbox, broaden privileges or relax governance preflight to obtain a pass.

References: [Claude installation/version verification](https://code.claude.com/docs/en/setup), [Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/), [named AppArmor profiles](https://docs.docker.com/engine/security/apparmor/#load-and-unload-profiles), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/), and [Ubuntu user-namespace restrictions](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007).
