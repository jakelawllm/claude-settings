# claude-code-for-lawyers

A hardened Claude Code configuration for legal practice, written for a NSW litigation firm and framed around the duty of confidentiality, legal professional privilege, and the conditions Australian courts impose on the use of generative artificial intelligence.

## Why this exists

Concrete configuration guidance for Claude Code exists, but none of it is written for lawyers. The security-engineering baselines assume a software team and in places recommend running with permission prompts disabled. The legal guidance — law society guides, bar association opinions, court practice notes — states the obligations clearly but stops at policy prose and never descends to a settings key.

This repository is an attempt to occupy that gap: to take the obligations as the courts and regulators have expressed them and express them as configuration that is enforced rather than aspirational.

It is offered for comparison and adaptation. It is a configuration baseline, not legal advice, and it does not replace a retainer term, a costs disclosure, a firm policy or a professional judgment about a particular matter.

## Contents

`managed-settings.json` is the organisation-level policy. It is enforced above user and project settings and cannot be overridden by staff, which is what makes it useful for supervision under rule 37 of the Legal Profession Uniform Law Australian Solicitors' Conduct Rules 2015.

`settings.json` is the user-level equivalent, for a sole practitioner or a small practice with no managed deployment. It is a subset of the organisation file limited to keys that work in user scope. Read the note on clause 6.5(b) below before treating it as an equivalent of the managed deployment, because on a consumer plan it is not one.

`matter-settings.json` is an optional per-matter file, placed at `.claude/settings.json` inside a matter folder, which denies the web tools for work where nothing should be reaching outward.

`ai-policy-legal-practice-template.docx` is the policy these files exist to enforce, as a template for an Australian practice. `ai-policy-legal-practice-template.md` is a rendering of it produced by `scripts/docx-to-md.py`, so that it can be read and diffed here. The `.docx` is the authoritative document. The policy governs: where it and the configuration differ, the configuration is wrong.

## Before you deploy anything

Two things sit outside these files and matter more than anything in them.

Turn off the model training setting at `claude.ai/settings/data-privacy-controls`. On a consumer plan this is what moves you from five-year retention with training to thirty-day retention without it. No configuration key substitutes for it.

Do not mistake that toggle for compliance. Clause 6.5(b) requires that the supplier not use inputs or outputs to train its models, "and that this is a term of the contract rather than a setting a user can alter". A toggle is a setting a user can alter. A consumer plan therefore cannot be entered in the Approved Tools Register at Schedule 1 whatever its configuration, and on such a plan `settings.json` is harm reduction for a tool the policy does not permit on client work, not an equivalent of the managed deployment. On Team, Enterprise or API access under commercial terms the position is set by contract and clause 6.5(b) is satisfied.

## What your plan decides

Clause 6 and clause 8 ask different questions, and a plan can pass the first and fail the second. This is the distinction that determines what the tool may be used on.

| | Clause 6, approved tool | Clause 8, restricted information |
|---|---|---|
| Free, Pro, Max | No. Training is controlled by a user-held toggle, so clause 6.5(b) fails | No |
| Team | Yes. No training is a term of the commercial contract | **No.** Zero data retention is not available below the enterprise tier, so prompts and outputs are retained for thirty days on infrastructure outside Australia |
| Enterprise with zero data retention, or an in-region provider deployment | Yes | Capable of satisfying clause 8.3, if the practitioner establishes it and records what establishes it |

The default position of this configuration is the middle row, because that is where most practices adopting it will sit. `claudeMd` accordingly states clause 8 material as a prohibition rather than an approval gate. Clause 8.7 already requires that result: where the practitioner cannot be satisfied of each of the four matters, the material is not to be used with any tool, and difficulty in establishing them is a reason not to proceed.

If the practice is on Enterprise with zero data retention granted, or runs Claude Code through Amazon Bedrock, Google Cloud's Agent Platform or Microsoft Foundry with an Australian region and the retention position pinned in the tenancy, the third row may apply. That is a conclusion to reach on the practice's own contract and to record under clause 8.4, not one to inherit from this file. Restore the approval gate in `claudeMd` only after it has been reached.

Australian Privacy Principle 8 sits alongside this and is not answered by retention alone. Sending personal information to United States infrastructure is a disclosure for which the practice remains accountable, and clause 6.5(d) requires the basis for satisfying APP 8 to be recorded before a tool is approved.

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

## Change these five things first

`claudeMd` opens with `REPLACE-WITH-YOUR-FIRM-NAME`. Substitute the practice's own name, and read the policy text through before you deploy it. It is one firm's position on scope, evidence, verification and records, and it is enforced as a standing instruction in every session, so it should say what your practice has actually decided rather than what this file happens to say.

`forceLoginOrgUUID` is not in the file and must be added, with the practice's real Anthropic organisation UUID. Clause 6.8 prohibits the use of a personal account for any work of the practice, even where the underlying product is the same as an approved tool, because the account determines the contractual terms, the retention period and whether inputs are used for training. `forceLoginMethod` does not reach that: it restricts the sign-in method, not the account, so a personal Claude.ai subscription satisfies it. `forceLoginOrgUUID` is the key that enforces clause 6.8. It is omitted here rather than shipped with a placeholder because an invalid value blocks every login, so add it once with the real value.

`OTEL_EXPORTER_OTLP_ENDPOINT` carries a placeholder. Point the five OpenTelemetry keys at your collector. Claude audit logs record access metadata and not conversation content, so your own collector is the only record of what was sent, to which endpoint, on what date, and that record is what you would rely on if a claim of privilege or compliance with the Harman undertaking is contested. Clause 6.5(h) requires that what logging is available to the practice be established before a tool is approved, and clause 16.5 requires that a tool which cannot produce a record of what was sent to it have that limitation recorded in Schedule 1. The five keys are what stop that limitation applying. Deleting them is a choice to record it.

`allowedMcpServers` is an allowlist operating together with `allowManagedMcpServersOnly`. Anything not named is blocked. Replace the example entry with the servers you actually sanction. An MCP server is itself a tool for the purposes of clause 6, so each one named here needs an assessment under clause 6.5 and an entry in Schedule 1 before it is added, not after.

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
| `disableSkillShellExecution`, `disableSideloadFlags`, `allowManagedHooksOnly` | Prevent code arriving through skills, hooks or command-line side-loading and executing inside a matter folder. |
| `strictKnownMarketplaces` | Confines plugin installation to an exact allowlist of marketplace sources, set here to the official Anthropic marketplace. Matching is exact, so the entry does not cover `ref` or `path` variants of the same repository. Set it to `[]` for complete lockdown, which blocks every source including the official one. It takes an array or is absent; a boolean is not a valid value and is stripped on load, leaving no restriction at all. |
| `browserExternalPageTools`, `disableBrowserExternalNavigation`, `disableMobileSimulatorTools` | Close the desktop app's browser pane and simulator as read and write surfaces. |
| `disableAutoMode`, `permissions.disableBypassPermissionsMode`, `permissions.defaultMode` | Keep a human in the approval loop. Manual approval is the default and neither auto mode nor bypass can be enabled. |
| `forceLoginMethod` | Restricts sign-in to Claude.ai accounts, so a session cannot be authenticated against an unmanaged console account or API key. |
| `forceRemoteSettingsRefresh` | The CLI exits rather than starting on cached or absent policy, closing the gap where a machine that never received the file runs unconstrained. |
| `permissions.deny` egress rules | Block the shell commands by which a prompt injection embedded in a client document could send file contents outward, including `curl`, `wget`, `scp`, `rsync`, `ssh`, `nc` and, on macOS, `osascript`. |
| `permissions.deny` credential rules | Keep cloud credential stores, GPG keyrings, package registry tokens, git credential caches and private key material out of context entirely. |
| `permissions.deny` settings rules | Prevent Claude editing the settings and shell profile files that constrain it. |
| `claudeMd` | Injects the firm policy as organisation-managed memory in every session, so it operates as a standing instruction rather than a document nobody opens. |

## The WebFetch hostname check

One channel stays open and is not closed by anything above. Before fetching a URL, the WebFetch tool sends the hostname to `api.anthropic.com` for a domain safety check. It does this whatever provider the session is using, and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` does not cover it, because the check is not treated as telemetry.

A hostname is not the content of a document, but it is not nothing either. The domains a practitioner looks up over the life of a matter will often identify the opponent, the industry and sometimes the matter.

There is a key that stops it, and it is not recommended here. `skipWebFetchPreflight` suppresses the check, but the documentation is explicit that "when skipped, WebFetch attempts any URL without consulting the blocklist". The blocklist is part of what stops a prompt injection embedded in a client document from directing a fetch to a domain chosen by whoever wrote the injection, which is the same attack the egress deny rules address. Setting the key trades a metadata disclosure for an exfiltration route, and that is the wrong way round.

Two things close it properly. Denying `WebFetch` removes the tool, and with it the check: `matter-settings.json` does this for a single matter, and the same two lines can be added to the managed file to do it everywhere. Or route the session through Amazon Bedrock, Google Cloud's Agent Platform or Microsoft Foundry, where the check is the one call still going to Anthropic and `skipWebFetchPreflight` exists precisely for that case, since a restrictive egress policy blocks it anyway.

Choose one deliberately. Leaving the default in place is a defensible choice, but it should be a choice.

## Optional further hardening

`allowManagedPermissionRulesOnly` prevents user and project settings defining any allow, ask or deny rules, so only the managed rules apply. It is the strongest available lock and it also stops saved approvals working, which produces approval fatigue across a team. Add it if you would rather have the friction.

`/sandbox` enables filesystem and network isolation for the Bash tool, which reduces permission prompts while narrowing what a command can reach.

`availableModels` with `enforceAvailableModels` restricts model selection. It is omitted here because an invalid value leaves only the default model available.

## Regulatory basis

The `claudeMd` policy string states clauses 7.1, 8.2, 8.3 and 9 of the policy in the compressed form a standing instruction requires. The policy is the authority: if the two ever differ, the string is to be corrected, not the policy. Both are drawn from the following, and the wording tracks them deliberately.

Practice Note SC Gen 23, Supreme Court of New South Wales, issued 28 January 2025 and commenced 3 February 2025, adopted in the District Court, Local Court and Land and Environment Court. Paragraph 9A prohibits entering material subject to a suppression or non-publication order, the implied Harman undertaking, material produced on subpoena, or material subject to a statutory prohibition on publication into any generative artificial intelligence program unless the practitioner is satisfied the information remains within the controlled environment of the platform, that the supplier is bound by confidentiality restrictions so the data is neither made publicly available nor used to train any large language model, that it is used only in connection with that proceeding, and that it is not used to train the program or any model. Paragraphs 10 to 18 carry the evidence and verification obligations.

Practice Direction on the Use of Artificial Intelligence, Federal Circuit and Family Court of Australia, issued 29 May 2026. Applies to all proceedings and all court users; requires compliance with confidentiality obligations, avoidance of entering sensitive information into publicly available tools, and an understanding of how a system stores and uses data before it is used.

Practice Note on Generative Artificial Intelligence (GPN-AI), Federal Court of Australia, April 2026. Notes that entering information into a ringfenced or confidential tool may still breach an obligation where outputs are later used for a different purpose.

Rule 9, Legal Profession Uniform Law Australian Solicitors' Conduct Rules 2015. Rule 9.1.2 excludes from the prohibition on disclosure a person otherwise engaged by the practice for the purposes of delivering or administering legal services in relation to the client, which is the provision on which the use of any external service provider rests. Rule 9.2.1 covers express or implied client authority in the alternative.

Australian Privacy Principle 8 and section 16C of the Privacy Act 1988 (Cth), which make a disclosing entity accountable for an overseas recipient's handling of personal information, subject to exceptions.

A Solicitor's Guide to Responsible Use of Artificial Intelligence, Law Society of New South Wales, January 2026, and the joint statement of the Law Society of NSW, the Victorian Legal Services Board and Commissioner and the Legal Practice Board of Western Australia of 6 December 2024.

## What the configuration reaches, and what it does not

These files are an enforcement layer for parts of four clauses of the policy, and no part of the rest.

They reach clause 6, by confining sign-in and the servers a session can call; clause 7, by stating the prohibited uses as a standing instruction; clause 8, by stating the restricted categories and the four satisfactions required before any of them is used; and clause 15, through retention, local storage and access.

They do not reach clause 9, verification; clause 10, disclosure to courts and tribunals; clause 11, experts and counsel; clause 12, clients, their own terms and their consent; clause 14, costs; clause 16, the record of what was done; clause 17, training; clause 19, incidents; or clause 20, compliance. Those clauses are discharged by people, and a configuration cannot be written that discharges them.

Two gaps are worth naming precisely, because they look like configuration problems and are not.

Clause 2.2 applies to personal devices. A managed settings file binds only the devices it has been deployed to. `forceRemoteSettingsRefresh` closes the gap for a machine that never received the file, but only where settings are served at sign-in, which requires Team or Enterprise. On any other plan, a practitioner who installs the CLI on a personal laptop is outside these files entirely, and clause 2.2 is enforced by supervision or not at all.

Clause 12.2 requires the client's own terms to be checked, and some clients prohibit the use of AI outright. There is no setting for that, and `matter-settings.json` is not one: denying the web tools narrows a session, it does not prohibit one. A matter in which the client has prohibited AI is a matter in which the tool is not opened.

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
