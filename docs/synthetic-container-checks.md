# Synthetic container checks and recovery

This runbook describes the controlled engineering environment inspected on 2026-09-08. It does not approve confidential matters or replace the external launcher, signing, approved-egress and records requirements in [architecture](production-architecture.md). No container image or launcher is distributed in this repository. The operator retains the image Dockerfile, scripts and results in the controlled evidence archive.

## Separate offline containment from authenticated tests

| Candidate | Purpose and current boundary |
|---|---|
| `mvp-acceptance` | Offline synthetic boundary probes. Node user UID 1000, read-only root filesystem and managed bundle, all capabilities dropped, no-new-privileges, network none, only Smith mounted, private persistent home. Claude 2.1.263 is installed. |
| `mvp-acceptance-phase4` | Disposable allow-all guard negative control with the same offline boundary. Stopped after probes. Never use it for an ordinary session. |
| `mvp-auth-20260908` | Separate synthetic authentication/live-hook harness. Pinned Claude 2.1.263, nonroot, read-only repository snapshot and private home volume. Ordinary bridge egress; no installed managed bundle. It cannot establish approved egress or managed deployment acceptance. |

The original containers were preserved under names ending in `-before-20260908` and are stopped. Their original `synthetic-matters` volume remains intact. The old containers are not current acceptance candidates. Their earlier root process, writable policy directories and malformed mount are not evidence of containment.

Keep authentication in the authentication container's private home volume. Never copy that volume, a host credential file, `.claude-orch/`, session history or local settings into a build context or repository snapshot. Use explicitly selected tracked source files. The local runtime is Git-ignored; force-adding it defeats that protection.

## Check effective permissions and mount semantics

Inspect only the required fields; full container inspection can expose environment credentials:

```text
docker inspect --format '{{.Config.User}} {{.HostConfig.ReadonlyRootfs}} {{json .HostConfig.CapDrop}} {{json .HostConfig.SecurityOpt}}' mvp-acceptance
docker inspect --format '{{range .Mounts}}{{.Destination}} writable={{.RW}}{{println}}{{end}}' mvp-acceptance
docker exec mvp-acceptance id
docker exec mvp-acceptance claude --version
```

The process must be nonroot. The managed bundle and every writable route through its parent directories must be protected. Root ownership of individual files does not prevent replacement through a writable parent. Probe access as the actual runtime UID, and verify the read-only mount rather than relying on mode bits alone.

With Docker `--mount`, use `type=bind,src=CONTROLLED_BUNDLE,dst=/etc/claude-code,readonly`. Do not append `:ro` to its `dst` field: that creates a different literal destination and leaves the mount writable. The `:ro` suffix belongs to Docker's distinct `-v` syntax. Mount only the selected child matter; mounting its parent exposes siblings.

The pinned image was built using an explicit Node image digest and `@anthropic-ai/claude-code@2.1.263`. The actual installed version was executed and checked. The repository's Python 3.12 hash-locked verification environment runs separately on the host; the container's system Python is an OS-probe utility.

## Reproduce engineering evidence

From the controlled evidence directory containing the retained scripts:

```text
python3 offline-container-check.py
python3 records-drill/reproduce.py
```

The first script checks actual child-process file access with strace and a host inotify observer. Positive controls must detect an actual sibling-canary read before and after the denial probes. It repeats the probes with the copied allow-all guard, checks credential/socket absence, offline IPv4/IPv6 connection failure, policy permissions and restart persistence. These are OS observations of synthetic subprocesses, not authenticated Read/Grep/Glob calls or external launcher acceptance.

The records drill uses genuine nonroot hook subprocesses, failed permissions, an interrupted partial write, retry from preserved source, backup restore and cross-UID access denial. It provides direct-hook engineering evidence only. The separate live harness subsequently verified temporary SessionEnd archive persistence, but no filing from the accepted managed target into approved records storage, supervised records service, independent backup destination, encryption, retention/hold policy or owner approval is inferred.

Results must name failures and environmental limits. The development manifest uses `--allow-dirty` during generation and verification; that label must not be promoted to a clean signed release. Once the complete intended checkout is committed and clean, generate a new clean release candidate and verify it separately. This was subsequently executed from clean candidate `a55e88c`, without `--allow-dirty`; the unsigned synthetic manifest verified. It does not approve deployment or replace the remaining host/account checks.

## Authentication and live tests

Complete interactive login directly in the target terminal, keeping codes and tokens out of chat and logs:

```text
docker exec -it -w /home/node mvp-auth-20260908 claude auth login
```

Then the operator can run the existing synthetic harnesses:

```text
docker exec -e CLAUDE_E2E=1 mvp-auth-20260908 node /opt/claude-settings/tests/e2e.test.js
docker exec -e CLAUDE_COMPLIANCE_LIVE=1 mvp-auth-20260908 node /opt/claude-settings/tests/compliance-live.js
```

The owner completed this login on 2026-09-08. The actual 2.1.263 client then passed all 13 E2E checks and all six conduct samples; `claude doctor` exited 0 with no installation issues. Synthetic output was reviewed and retained externally. These model calls spend tokens. A successful login or harness does not establish the installed managed organisation restriction. The rendered offline bundle uses a synthetic organisation UUID; actual account-bound settings require the intended organisation identifier and observed `/status` on the accepted target.

## Nested sandbox failure

The following actual probe failed on the reviewed host:

```text
docker exec mvp-acceptance bwrap --unshare-user --ro-bind / / -- true
```

Default container controls refused namespace creation. Disposable no-data diagnostic containers also failed under individual seccomp/AppArmor relaxations; those diagnostic settings are not used by the candidate. The final candidates retain Docker's default profiles, all capability drops and no-new-privileges.

A fresh disposable probe traced `clone(CLONE_NEWNS + CLONE_NEWUSER)` returning `EPERM`. Ubuntu user namespaces are enabled, but the host's separate unprivileged-user-namespace AppArmor profile denies capabilities; no applicable bwrap-specific host profile was available. Image packages alone cannot change that host policy.

A host administrator must inspect `sudo aa-status`, installed AppArmor/parser versions and the kernel denial records. Using the installed versions, review a separately named confined AppArmor profile and corresponding narrow seccomp allowances for the candidate's namespace/setup operations. The loaded-profile inventory and privileged loading are unavailable to this review account, so a complete policy is not invented here. Do not copy an upstream profile for an incompatible ABI.

Load only the reviewed named profile and test it with the pinned image, preserving the existing restrictions:

```text
sudo apparmor_parser -r -W /controlled/claude-mvp-bwrap.apparmor
docker run --rm --network none --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges --security-opt apparmor=claude-mvp-bwrap --security-opt seccomp=/controlled/claude-mvp-seccomp.json PINNED_IMAGE_ID bwrap --unshare-user --ro-bind / / -- true
```

These are administrator next steps, not executed passes; the reviewed files must exist first. Require exit 0 and inspect the remaining denials. Apply the reviewed profiles only to the acceptance candidate, then rerun all boundary/observer/negative-control and restart checks, `claude doctor`, installed-client `/status` and [every OS acceptance row](os-isolation-acceptance.md). A supported alternate host is the alternative if the current host cannot meet those requirements. Do not change `failIfUnavailable`, disable the nested sandbox, add broad privileges or relax production preflight to turn this failure into a pass.

For the offline candidate, stop with `docker stop mvp-acceptance` and resume with `docker start mvp-acceptance`; its private state volume is retained. Do not delete old containers, volumes, source transcripts or quarantined partial files as a recovery step. Preserve the authentication home and records evidence separately from source control.

Runtime reference: [Claude installation and version verification](https://code.claude.com/docs/en/setup). Container option reference: [Docker run](https://docs.docker.com/engine/containers/run/) and [bind mounts](https://docs.docker.com/engine/storage/bind-mounts/).

Host policy references: [Docker named AppArmor profiles](https://docs.docker.com/engine/security/apparmor/#load-and-unload-profiles), [Docker seccomp restrictions](https://docs.docker.com/engine/security/seccomp/) and [Ubuntu user-namespace restrictions](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007).
