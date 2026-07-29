# claude-code-for-lawyers

A hardened Claude Code configuration for legal practice, written for a NSW litigation firm and framed around the duty of confidentiality, legal professional privilege, and the conditions Australian courts impose on the use of generative artificial intelligence.

## Why this exists

Concrete configuration guidance for Claude Code exists, but none of it is written for lawyers. The security-engineering baselines assume a software team and in places recommend running with permission prompts disabled. The legal guidance — law society guides, bar association opinions, court practice notes — states the obligations clearly but stops at policy prose and never descends to a settings key.

This repository is an attempt to occupy that gap: to take the obligations as the courts and regulators have expressed them and express them as configuration that is enforced rather than aspirational.

It is offered for comparison and adaptation. It is a configuration baseline, not legal advice, and it does not replace a retainer term, a costs disclosure, a firm policy or a professional judgment about a particular matter.

## Contents

`managed-settings.json` is the organisation-level policy. It is enforced above user and project settings and cannot be overridden by staff, which is what makes it useful for supervision under rule 37 of the Legal Profession Uniform Law Australian Solicitors' Conduct Rules 2015.

`settings.json` is the user-level equivalent, for a sole practitioner or a small practice with no managed deployment. It is a subset of the organisation file limited to keys that work in user scope.

`matter-settings.json` is an optional per-matter file, placed at `.claude/settings.json` inside a matter folder, which denies the web tools for work where nothing should be reaching outward.

## Before you deploy anything

Two things sit outside these files and matter more than anything in them.

Turn off the model training setting at `claude.ai/settings/data-privacy-controls`. On a consumer plan this is what moves you from five-year retention with training to thirty-day retention without it. No configuration key substitutes for it. On Team, Enterprise or API access under commercial terms, training is off by default and the position is set by contract rather than by a toggle any user can change.

Exclude the `.claude` directory from OneDrive, Dropbox, iCloud Drive, roaming profiles and any consumer backup agent, and keep whole-disk encryption on. Session transcripts are written there in plaintext. They are the firm's own records on the firm's own machine, so they are not a disclosure to anyone, but a sync client that replicates the home directory turns them into one by a route nobody assessed.

## Installation

Deploy the organisation file to the system location for the platform:

```
macOS         /Library/Application Support/ClaudeCode/managed-settings.json
Windows       C:\Program Files\ClaudeCode\managed-settings.json
Linux, WSL    /etc/claude-code/managed-settings.json
```

The legacy Windows path under `ProgramData` is no longer read. The same content can be delivered through device management instead, using the `com.anthropic.claudecode` preferences domain on macOS or the `HKLM\SOFTWARE\Policies\ClaudeCode` registry key on Windows with the JSON in a `Settings` value. Where several policy fragments need to be maintained separately, a `managed-settings.d/` directory alongside the main file is merged over it in alphabetical order.

File-based and MDM delivery work on any plan, because they are enforced on the device rather than by the account. Server-managed delivery through the admin console, which pushes policy at sign-in and removes the risk of a machine that never received the file, requires Team or Enterprise.

The user file goes to `~/.claude/settings.json`, or `%USERPROFILE%\.claude\settings.json` on Windows.

## Change these four things first

`claudeMd` opens with `REPLACE-WITH-YOUR-FIRM-NAME`. Substitute the practice's own name, and read the policy text through before you deploy it. It is one firm's position on scope, evidence, verification and records, and it is enforced as a standing instruction in every session, so it should say what your practice has actually decided rather than what this file happens to say.

`OTEL_EXPORTER_OTLP_ENDPOINT` carries a placeholder. Either point the five OpenTelemetry keys at your collector or delete all five. They matter more than they would on an Enterprise plan, because Claude audit logs record access metadata and not conversation content, so your own collector is the only record of what was sent, to which endpoint, on what date. That record is what you would rely on if a claim of privilege or compliance with the Harman undertaking is contested.

`allowedMcpServers` is an allowlist operating together with `allowManagedMcpServersOnly`. Anything not named is blocked. Replace the example entry with the servers you actually sanction.

`requiredMinimumVersion` blocks startup below the stated version. Confirm the fleet is at or above it before pushing, or drop to `minimumVersion`, which governs updates without blocking a session.

## Verification

```
claude doctor      # lists any managed entry stripped as invalid, with source and field
/status            # confirms which settings sources loaded for the session
/permissions       # shows the effective permission rules
```

Managed settings parse tolerantly, so one bad entry is stripped rather than voiding the file. That tolerance does not extend to user, project or local settings, where a file that fails validation is rejected whole. Deploy to one machine and run `claude doctor` before pushing to the fleet.

## What the settings do

| Key | Purpose |
| --- | --- |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_FEEDBACK_COMMAND`, `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, `CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY` | Close the channels that carry longer retention than the sessions themselves. The feedback, bug and share commands transmit conversation history including file contents and are retained for five years; an accepted transcript share uploads the session log with only known key and token patterns redacted, retained for up to six months. |
| `cleanupPeriodDays` | Shortens the local plaintext transcript cache from the thirty-day default. Set to seven so the local copy expires inside the server retention window. `CLAUDE_CODE_SKIP_PROMPT_HISTORY` disables transcript writes entirely, at the cost of session resumption and of any record of how the work was done. |
| `disableArtifact` | The artifact tool publishes session output as a private web page on claude.ai. This is a route by which client content leaves without an obvious prompt. |
| `disableRemoteControl` | Remote Control relays a local session through claude.ai and stores the transcript on Anthropic servers while connected. |
| `disableClaudeAiConnectors` | Stops claude.ai connectors being fetched and attached, so nothing reaches mail, calendar or a knowledge base unless deliberately configured. |
| `disableAgentView` | Removes background and unattended agents. A supervision question rather than a confidentiality one, but relevant where supervised staff or interns use the tool. |
| `disableSkillShellExecution`, `disableSideloadFlags`, `strictKnownMarketplaces`, `allowManagedHooksOnly` | Prevent code arriving through skills, plugin marketplaces, hooks or command-line side-loading and executing inside a matter folder. |
| `browserExternalPageTools`, `disableBrowserExternalNavigation`, `disableMobileSimulatorTools` | Close the desktop app's browser pane and simulator as read and write surfaces. |
| `disableAutoMode`, `permissions.disableBypassPermissionsMode`, `permissions.defaultMode` | Keep a human in the approval loop. Manual approval is the default and neither auto mode nor bypass can be enabled. |
| `forceLoginMethod` | Restricts sign-in to Claude.ai accounts, so a session cannot be authenticated against an unmanaged console account or API key. |
| `forceRemoteSettingsRefresh` | The CLI exits rather than starting on cached or absent policy, closing the gap where a machine that never received the file runs unconstrained. |
| `permissions.deny` egress rules | Block the shell commands by which a prompt injection embedded in a client document could send file contents outward, including `curl`, `wget`, `scp`, `rsync`, `ssh`, `nc` and, on macOS, `osascript`. |
| `permissions.deny` credential rules | Keep cloud credential stores, GPG keyrings, package registry tokens, git credential caches and private key material out of context entirely. |
| `permissions.deny` settings rules | Prevent Claude editing the settings and shell profile files that constrain it. |
| `claudeMd` | Injects the firm policy as organisation-managed memory in every session, so it operates as a standing instruction rather than a document nobody opens. |

## Optional further hardening

`allowManagedPermissionRulesOnly` prevents user and project settings defining any allow, ask or deny rules, so only the managed rules apply. It is the strongest available lock and it also stops saved approvals working, which produces approval fatigue across a team. Add it if you would rather have the friction.

`/sandbox` enables filesystem and network isolation for the Bash tool, which reduces permission prompts while narrowing what a command can reach.

`availableModels` with `enforceAvailableModels` restricts model selection. It is omitted here because an invalid value leaves only the default model available.

`forceLoginOrgUUID` requires login to belong to a nominated Anthropic organisation. It is omitted because an invalid value blocks all logins, so it should be added once with the real UUID rather than shipped with a placeholder.

## Regulatory basis

The `claudeMd` policy string is drawn from the following, and the wording tracks them deliberately.

Practice Note SC Gen 23, Supreme Court of New South Wales, issued 28 January 2025 and commenced 3 February 2025, adopted in the District Court, Local Court and Land and Environment Court. Paragraph 9A prohibits entering material subject to a suppression or non-publication order, the implied Harman undertaking, material produced on subpoena, or material subject to a statutory prohibition on publication into any generative artificial intelligence program unless the practitioner is satisfied the information remains within the controlled environment of the platform, that the supplier is bound by confidentiality restrictions so the data is neither made publicly available nor used to train any large language model, that it is used only in connection with that proceeding, and that it is not used to train the program or any model. Paragraphs 10 to 18 carry the evidence and verification obligations.

Practice Direction on the Use of Artificial Intelligence, Federal Circuit and Family Court of Australia, issued 29 May 2026. Applies to all proceedings and all court users; requires compliance with confidentiality obligations, avoidance of entering sensitive information into publicly available tools, and an understanding of how a system stores and uses data before it is used.

Practice Note on Generative Artificial Intelligence (GPN-AI), Federal Court of Australia, April 2026. Notes that entering information into a ringfenced or confidential tool may still breach an obligation where outputs are later used for a different purpose.

Rule 9, Legal Profession Uniform Law Australian Solicitors' Conduct Rules 2015. Rule 9.1.2 excludes from the prohibition on disclosure a person otherwise engaged by the practice for the purposes of delivering or administering legal services in relation to the client, which is the provision on which the use of any external service provider rests. Rule 9.2.1 covers express or implied client authority in the alternative.

Australian Privacy Principle 8 and section 16C of the Privacy Act 1988 (Cth), which make a disclosing entity accountable for an overseas recipient's handling of personal information, subject to exceptions.

A Solicitor's Guide to Responsible Use of Artificial Intelligence, Law Society of New South Wales, January 2026, and the joint statement of the Law Society of NSW, the Victorian Legal Services Board and Commissioner and the Legal Practice Board of Western Australia of 6 December 2024.

## Known limitations

These files govern Claude Code. They do not govern Cowork, where sessions run on Anthropic servers and files opened through the desktop app are processed there rather than on your machine, and where network egress permissions do not apply to web fetch, web search or MCP servers. They do not prevent a desktop app user selecting a Cloud session, which clones the project folder to an Anthropic-managed virtual machine; on Team or Enterprise that path is closed through the admin console instead.

Claude audit logs capture access metadata and not conversation content, so without your own telemetry there is no record of what was sent.

Settings keys change between releases. The controlling reference is `https://code.claude.com/docs/en/settings`, not this file. Verify key names against it before relying on them, and re-check after a major version.

Configuration cannot answer the underlying questions. Whether the retainer or the client's own engagement terms permit the use, whether the use is confined to the matter, and whether the paragraph 9A satisfaction has been formed and recorded remain judgments for the responsible practitioner.

## Status

Written for Claude Code v2.1.207 and later, July 2026. Tested on macOS and Windows.

## Licence

MIT. Adapt freely. Attribution appreciated but not required.

This is published for reference and adaptation rather than as a collaborative project. Issues and pull requests are not monitored. Fork it and make it yours. Where a key here turns out to be misused or superseded, the controlling reference is `https://code.claude.com/docs/en/settings` rather than this file or its author.
