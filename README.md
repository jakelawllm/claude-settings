# claude-code-for-lawyers

A hardened Claude Code configuration for legal practice, written for a NSW litigation firm and framed around the duty of confidentiality, legal professional privilege, and the conditions Australian courts impose on the use of generative artificial intelligence.

## Why this exists

Concrete configuration guidance for Claude Code exists, but none of it is written for lawyers. The security-engineering baselines assume a software team and in places recommend running with permission prompts disabled. The legal guidance — law society guides, bar association opinions, court practice notes — states the obligations clearly but stops at policy prose and never descends to a settings key.

This repository is an attempt to occupy that gap: to take the obligations as the courts and regulators have expressed them and express them as configuration that is enforced rather than aspirational.

It is offered for comparison and adaptation. It is a configuration baseline, not legal advice, and it does not replace a retainer term, a costs disclosure, a firm policy or a professional judgment about a particular matter.

> **Status: beta reference implementation. Not a production compliance package.**
>
> This has not had independent security or legal review. Read these three limits before relying on any of it.
>
> **The matter guard is not a security boundary on its own.** It constrains the model, not a determined user, and it does not parse shell commands: a Bash command can still address another matter directly. What contains Bash is the operating system sandbox, enabled in `managed-settings.json`.
>
> **Native Windows is not a supported platform for matter isolation.** The sandbox does not run there, and the shipped settings set `failIfUnavailable` to `false`, so Claude Code starts anyway. On those machines nothing at the operating system level contains a Bash command, and matter separation rests on the hook alone, which is advisory. Use macOS, Linux, or Windows with Claude Code inside WSL2 if the boundary needs to hold. If you deploy to native Windows, record in Schedule 8 that isolation is advisory there.
>
> **The tool list is fixed.** New built-in tools, plugin tools and MCP tools fall outside the guard until it is updated for them.

## Contents

`managed-settings.json` is the organisation-level policy. It is enforced above user and project settings and cannot be overridden by staff, which is what makes it useful for supervision under rule 37 of the Legal Profession Uniform Law Australian Solicitors' Conduct Rules 2015.

`settings.json` is the user-level equivalent, for a sole practitioner or a small practice with no managed deployment. It is a subset of the organisation file limited to keys that work in user scope. Read the note on clause 6.5(b) below before treating it as an equivalent of the managed deployment, because on a consumer plan it is not one.

`matter-settings.json` is an optional per-matter file, placed at `.claude/settings.json` inside a matter folder, which denies the web tools for work where nothing should be reaching outward.

`skills/ai-policy-compliance/SKILL.md` is the conduct layer. The settings decide what the tool may do; the skill decides what may be produced and what must be said about it. It refuses to draft the content of evidence, stops and asks when material looks like clause 8 restricted information, requires a verification worklist and a Schedule 2 record with any draft that cites authority, and refuses to tell a practitioner that a citation has been checked. Deploy it at the enterprise level, alongside the managed settings file, where it overrides a personal or project skill of the same name so a user cannot shadow it.

`SECURITY.md` states what is and is not a security boundary here, and how to report a finding privately. `CONTRIBUTING.md` records that contributions are not accepted. `CHANGELOG.md` tracks the changes. `.github/workflows/ci.yml` runs the hook tests on Windows, macOS and Linux, validates the JSON, regenerates the policy Markdown from the DOCX and fails on drift, checks that every clause reference resolves, and scans the full history for secrets.

`hooks/matter-guard.js` keeps one session to one matter and files the session record to the matter folder. It is the only part of this repository that enforces something the settings keys cannot express, and it is wired up in `managed-settings.json`. `tests/matter-guard.test.js` is its test suite; run it before deploying a change to the hook, because two of its cases exist for bugs that were live in earlier drafts.

`ai-protocol-barristers-chambers.docx` is the equivalent for a barrister and for chambers, with its own Markdown rendering. It covers the same ground from the other side of the brief: releasing work under your own name, readers and devils, chambers arrangements, fees rather than costs, and copyright in what a tool produces. Its clause numbering is its own and does not track the practice policy, so a chambers adopting it needs its own mapping to any configuration built against it. Nothing in this repository is wired to it.

`ai-policy-legal-practice-template.docx` is the policy these files exist to enforce, as a template for an Australian practice. `ai-policy-legal-practice-template.md` is a rendering of it produced by `scripts/docx-to-md.py`, so that it can be read and diffed here. The `.docx` is the authoritative document, and where it and the configuration differ the configuration is ordinarily what needs correcting.

There is one deliberate exception, in the practice policy. Clause 7.3 prohibits using a tool to draft an expert report "without prior leave of the court where leave is required", so the clause permits the work once leave is obtained. `claudeMd` and the compliance skill prohibit it outright and do not ask about leave. That is a practice deciding to be stricter than its own policy, not a drafting error: a firm adopting this template either amends clause 7.3 to match, or relaxes the two instruments to match the clause. It should not be left as it stands here without a decision, because a practitioner reading the policy would be told the work is available and the tool would refuse it.

## Before you deploy anything

Two things sit outside these files and matter more than anything in them.

Turn off the model training setting at `claude.ai/settings/data-privacy-controls`. On a consumer plan this is what moves you from five-year retention with training to thirty-day retention without it. No configuration key substitutes for it.

Do not mistake that toggle for compliance. Clause 6.5(b) requires that the supplier not use inputs or outputs to train its models, "and that this is a term of the contract rather than a setting a user can alter". A toggle is a setting a user can alter. A consumer plan therefore cannot be entered in the Approved Tools Register at Schedule 1 whatever its configuration, and on such a plan `settings.json` is harm reduction for a tool the policy does not permit on client work, not an equivalent of the managed deployment. On Team, Enterprise or API access under commercial terms the position is set by contract and clause 6.5(b) is satisfied.

## What your plan decides

Clause 6 and clause 8 ask different questions, and a plan can pass the first and fail the second.

| | Clause 6, approved tool | Clause 8, restricted information |
|---|---|---|
| Free, Pro, Max | No. Training is controlled by a user-held toggle, so clause 6.5(b) fails | No |
| Team | Yes. No training is a term of the commercial contract | Available, on the conditions below |
| Enterprise with zero data retention, or a deployment in the practice's own cloud tenancy in an Australian region | Yes | The most readily evidenced route, and the one to use where a client term or the sensitivity of the material requires that the supplier retain nothing |

The middle row is the default assumption of this configuration, because it is where most practices adopting it will sit.

A retention period is not publication and it is not training. Paragraph 9A of Practice Note SC Gen 23 asks whether the material stays in a controlled environment, whether the supplier is bound so it is neither made public nor used for training, whether use is confined to the proceeding, and whether it trains the model. It does not ask how long the supplier holds it. The absence of a zero retention arrangement therefore does not by itself defeat clause 8.3, which is why `claudeMd` states an approval gate and not a prohibition.

Where zero retention is unavailable, three things carry the satisfaction instead, and all three must be in place before the approval is given:

The contractual term that inputs and outputs are not used to train any model and are not made publicly available. On a commercial plan this is contract, not configuration, and nothing in these files affects it.

The closure of every channel retaining material for longer than the session. That is what the five environment variables at the head of the file do. The feedback, bug and share commands retain for five years and an accepted transcript share for six months, against thirty days for the session itself, so on a plan without zero retention these are the settings that matter most and are mandatory rather than prudent.

The practitioner being able to show from the practice's own records that the material was sent, when, by whom and to which endpoint. This is the one that needs care, and it is dealt with next.

Australian Privacy Principle 8 sits alongside all of this and is not answered by retention either. Sending personal information to United States infrastructure is a disclosure for which the practice remains accountable, and clause 6.5(d) requires the basis for satisfying APP 8 to be recorded before a tool is approved.

## What the telemetry record actually contains

The five OpenTelemetry keys give the practice its own record of sessions, and that record is the third limb above. It is important to be exact about what it holds, because it is easy to assume it holds more.

By default it does not contain what was sent. Content is gated separately from telemetry itself, and every gate is off unless it is set. `OTEL_LOG_USER_PROMPTS` governs prompt text, `OTEL_LOG_ASSISTANT_RESPONSES` the model's replies, and `OTEL_LOG_TOOL_DETAILS` and `OTEL_LOG_TOOL_CONTENT` the tool arguments and results. With all four unset, what the collector receives for a prompt is `user_prompt_length`, the length in characters. The record therefore establishes that a session occurred, when, by whom and how much was sent. It does not establish the content, and it holds no model output at all.

That is still a real record, and for the third limb above it is the right one: it evidences transmission without creating a second copy of the client's material.

Where the content itself must be recoverable, there are three routes, and they should be chosen rather than fallen into. Setting the gates makes the collector hold the conversation, at which point it becomes a store of privileged material and must be secured, retained and disclosed on the same footing as the matter file. The local transcript holds the session but expires on `cleanupPeriodDays`, set to seven here, and is removed entirely by `CLAUDE_CODE_SKIP_PROMPT_HISTORY`. Or the record is made by hand on the matter file, which is what a clause 17 record and a Schedule 2 form are for. The third is the one the policy relies on.

Two properties of the gates are worth knowing before touching them. `OTEL_LOG_ASSISTANT_RESPONSES` falls back to the value of `OTEL_LOG_USER_PROMPTS` when it is unset, so enabling prompt content also enables response content unless the response gate is expressly set to `0`. And where sign-in is by OAuth, the user's email address appears in telemetry attributes, which the collector's own retention has to account for whether or not any content gate is set.

All three content records can be off at once, and nothing announces it.

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

The skill and the hook go into the same system directory as the organisation file, which is what makes them organisation policy rather than a preference a user can change:

```
<system directory>/skills/ai-policy-compliance/SKILL.md
<system directory>/hooks/matter-guard.js
```

The `hooks` block in `managed-settings.json` ships with the Linux and WSL path, `node "/etc/claude-code/hooks/matter-guard.js"`, because that is where the sandbox runs. A managed settings file is plain JSON with no variable expansion, so the command is a literal path and **must be edited for the platform it is deployed to**:

```
macOS      node "/Library/Application Support/ClaudeCode/hooks/matter-guard.js"
Linux/WSL  node "/etc/claude-code/hooks/matter-guard.js"
```

Deploying the file unedited to macOS silently disables the guard: the hook command fails to launch and the session continues. Run the verification below on one machine per platform before the fleet.

A skill in that directory is the enterprise level, and it overrides a personal or project skill of the same name, so a practitioner cannot shadow it with a laxer copy. The `hooks` block in `managed-settings.json` points at the path above; change it there if you deploy the script elsewhere. The hook needs Node on the machine.

Two settings decide how firmly this holds. `allowManagedHooksOnly` is already set, so only managed hooks load and a user cannot disable the guard by editing their own settings. `strictPluginOnlyCustomization` is not set here: it blocks skills, agents, hooks and MCP servers from user and project sources so they can come only from plugins or managed settings, and it accepts an array such as `["skills", "hooks"]` to lock named surfaces rather than all four. Consider it if a practitioner adding their own skills is a concern; leave it off if it is not, because it also stops legitimate local tooling.

## Change these seven things first

`claudeMd` opens with `REPLACE-WITH-YOUR-FIRM-NAME`. Substitute the practice's own name, and read the policy text through before you deploy it. It is one firm's position on scope, evidence, verification and records, and it is enforced as a standing instruction in every session, so it should say what your practice has actually decided rather than what this file happens to say.

`forceLoginOrgUUID` is not in the file and must be added, with the practice's real Anthropic organisation UUID. Clause 6.8 prohibits the use of a personal account for any work of the practice, even where the underlying product is the same as an approved tool, because the account determines the contractual terms, the retention period and whether inputs are used for training. `forceLoginMethod` does not reach that: it restricts the sign-in method, not the account, so a personal Claude.ai subscription satisfies it. `forceLoginOrgUUID` is the key that enforces clause 6.8. It is omitted here rather than shipped with a placeholder because an invalid value blocks every login, so add it once with the real value.

`CLAUDE_MATTER_ROOTS` carries a placeholder and the `hooks` block that reads it. Set it to the matters root and every alias that share answers to, or remove both the variable and the `hooks` block.

`CLAUDE_MATTER_MODE` ships as `warn`, so the guard observes and reports without refusing anything. That is the right setting while the matters root is being established and the aliases confirmed, and the wrong setting to leave in place. Move it to `enforce` once the log of what it would have blocked is empty of surprises.

`OTEL_EXPORTER_OTLP_ENDPOINT` carries a placeholder. Point the five OpenTelemetry keys at your collector. Claude audit logs record access metadata and not conversation content, so your own collector is the only record of what was sent, to which endpoint, on what date, and that record is what you would rely on if a claim of privilege or compliance with the Harman undertaking is contested. Clause 6.5(h) requires that what logging is available to the practice be established before a tool is approved, and clause 17.5 requires that a tool which cannot produce a record of what was sent to it have that limitation recorded in Schedules 1 and 8. The five keys are what stop that limitation applying. Deleting them is a choice to record it.

`allowedMcpServers` ships **empty**, so no MCP server loads. That is deliberate. An entry of the form `{"serverName": "context7"}` matches a display name, and a display name is chosen by whoever configures the server: a different server presenting the same name satisfies the rule. Anthropic's managed MCP documentation recommends `serverUrl` where the match must survive a rename, and the same reasoning applies to an allowlist. Identify an approved server by its exact URL or command, not its label. An MCP server is itself a tool for the purposes of clause 6, so each one needs an assessment under clause 6.5 and an entry in Schedule 1 before it is added, not after.

`sandbox` is enabled, with `failIfUnavailable` and `allowUnsandboxedCommands: false`. This is the only part of the baseline the operating system enforces rather than the client, and it is what actually contains a Bash command. `failIfUnavailable` ships as `false`, so a machine without a sandbox still runs. That is a deliberate deployability choice and it has a cost: on native Windows there is no operating system boundary at all, and Bash can reach another matter regardless of the hook. Set it to `true` to make Claude Code refuse to start rather than run unprotected, which is the stronger position and the one to take if the fleet is macOS, Linux or WSL2. Either way, record which machines are which in Schedule 8.

`requiredMinimumVersion` blocks startup below the stated version. Confirm the fleet is at or above it before pushing, or drop to `minimumVersion`, which governs updates without blocking a session.

## Verification

```
claude doctor      # lists any managed entry stripped as invalid, with source and field
/status            # confirms which settings sources loaded for the session
/permissions       # shows the effective permission rules
```

Managed settings parse tolerantly, so one bad entry is stripped rather than voiding the file. That tolerance does not extend to user, project or local settings, where a file that fails validation is rejected whole. Deploy to one machine and run `claude doctor` before pushing to the fleet.

`claude doctor` validates settings keys. It does not exercise the hook, which is ordinary code and fails in ordinary ways. Run its tests separately:

```
node tests/matter-guard.test.js          # the guard, driven directly
python scripts/check-clause-refs.py      # clause references resolve
CLAUDE_E2E=1 node tests/e2e.test.js      # optional: real Claude Code sessions
```

The first two must always pass and run in CI. The third is opt-in: it launches `claude -p` against a temporary two-matter tree, so it needs a signed-in installation and spends tokens, and it does not run in CI. It exists because driving the hook directly cannot show that Claude Code actually invokes it, with the payload it really sends, and that a refusal at the hook keeps the other matter's content out of the answer. It asserts on containment of a token from the other matter rather than on the wording of a refusal.

Two cases in the unit suite assert what the guard does **not** do: that a Bash command reaching another matter is allowed, and that an unrecognised tool is not covered. They are there so this README cannot drift away from the behaviour. If either starts failing, the boundary has moved and the documentation is wrong in the direction that matters.

Every case must pass. Two cases are skipped on Windows, where POSIX permission bits do not apply; CI runs them on Linux and macOS. A hook that crashes or is misconfigured is not obviously broken from inside a session: in `warn` it says nothing, and in `enforce` a fault that stops it running removes the boundary rather than announcing itself. The suite is the only thing that tells you the guard still works.

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

## Keeping one session to one matter

`claudeMd` tells the practitioner to confine a session to one matter. That is an instruction, and an instruction is not a control. `hooks/matter-guard.js` is the control.

It cannot do quite what you would expect. A `SessionStart` hook cannot block a session from starting, so nothing prevents a session being opened in the wrong place. What `PreToolUse` can do is block a tool call. The first client path a session touches binds it, and every later path under a different matter is refused through the file tools, whatever the session was doing beforehand.

That is narrower than "no session touches two matters", and the difference matters. The guard covers a fixed list of file tools. It does not parse Bash commands, so a shell command can address another matter by absolute path; containment of Bash comes from the sandbox, not from here. It also does not cover tools it has not been told about, including new built-ins, plugin tools and MCP tools. Where the sandbox cannot run, the guard is advisory for those routes.

The guard runs on three events. `PreToolUse` does the enforcement across Read, Edit, Write, NotebookEdit, Grep, Glob and Bash. `SessionEnd` files the completed transcript into the matter folder, which is what makes the session record a record of the matter rather than a cache in a user profile. `SessionStart` names the bound matter as context, and is advisory only.

Set `CLAUDE_MATTER_ROOTS` to the matters root, and list **every alias the share answers to**, separated by semicolons: the IP form, the hostname form, and any drive letter staff map to it. An unlisted alias is not recognised as client material, so the omission is silent and the guard simply does not see the matter. Deploy the script beside the managed settings file, or change the path in the `hooks` block.

Matter identity is the folder name, so the same matter reached by any listed alias compares equal, and `..` and `.` are resolved before comparison, so a path that leaves the bound matter and re-enters another is caught rather than read as its first segment.

`CLAUDE_MATTER_MODE` has three settings. In `enforce` the guard refuses cross-matter access. In `warn` it allows the access, says so in the session, and appends a line to `would-have-blocked.log` in its state directory: that log is the point of the observation period, because it is the list of accesses enforcement would refuse, and an empty one is the evidence for turning enforcement on. In `off` it does nothing.

In `enforce` the guard fails closed. Installed with `CLAUDE_MATTER_ROOTS` unset, it denies all file access with an explanation rather than enforcing nothing, because a control that quietly does nothing is worse than no control: the practice believes it is protected. In `warn` it stands down instead, which is what makes `warn` usable before the root exists. Remove the `hooks` block if you do not want the guard at all.

`SessionEnd` files the transcript into the matter's own folder, under `_ai-record`. The record therefore lives beside the file it belongs to, and is retained and destroyed with it — which is what clause 17.4 of the accompanying policy already provides for, without a second schedule.

Setting `CLAUDE_RECORD_ROOT` files every session into one archive instead, as `<root>/<matter>/`. It is left unset here. If you do set it, the guard treats a path under `<root>/<matter>/` as belonging to that matter, so a session reads its own records and is refused every other matter's, and roots are matched longest first so an archive nested inside the matters root is still recognised as the archive. Without that the archive would sit outside the boundary and any session could read every matter's records.

That protection reaches only what passes through Claude Code. A separate job that sweeps the `_ai-record` folders into a central store builds something the guard never sees: one directory holding client material from every matter, with client names for folder names. Give it permissions to match before it exists, not after — the concentration is the risk, not the copying.

Wherever the records end up, the location must sit inside the practice's own backup and inside its destruction schedule. A location that is backed up but never destroyed is not a retention policy, it is an accumulation.

Two limits, stated rather than buried. **Bash is confined by working directory, not by inspecting commands**, so a shell command can still read across matters; on macOS and WSL2 the Bash sandbox is the real boundary and should be enabled, and on native Windows there is no equivalent. And hooks are client-side: they constrain the model, not a determined user.

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

They reach clause 6, by confining sign-in and the servers a session can call; clause 7, by stating the prohibited uses as a standing instruction; clause 8, by stating the restricted categories and the matters that must be satisfied before any of them is used; clause 16, through retention, local storage and access; and part of clause 17, because the session record is filed to the matter folder rather than left in a user profile.

The skill at `skills/ai-policy-compliance/SKILL.md` reaches further than the settings can, because it governs the answer rather than the tool: clause 7's prohibitions as a refusal, clause 9's verification as a worklist that never claims to have been done, clause 10's disclosure wordings, clause 17's record, and clause 20's reporting duty when a breach is disclosed rather than prevented. It is instruction rather than enforcement, which is why it sits above the settings and not instead of them.

They do not reach clause 9, verification; clause 10, disclosure to courts and tribunals; clause 11, experts and counsel; clause 12, clients, their own terms and their consent; clause 14, costs; clause 15, recording and transcription; the rest of clause 17, since a transcript is not the structured record clause 17.2 requires; clause 18, training; clause 20, incidents; or clause 21, compliance. Those clauses are discharged by people, and a configuration cannot be written that discharges them.

Two gaps are worth naming precisely, because they look like configuration problems and are not.

Clause 2.2 applies to personal devices. A managed settings file binds only the devices it has been deployed to. `forceRemoteSettingsRefresh` closes the gap for a machine that never received the file, but only where settings are served at sign-in, which requires Team or Enterprise. On any other plan, a practitioner who installs the CLI on a personal laptop is outside these files entirely, and clause 2.2 is enforced by supervision or not at all.

Clause 12.2 requires the client's own terms to be checked, and some clients prohibit the use of AI outright. There is no setting for that, and `matter-settings.json` is not one: denying the web tools narrows a session, it does not prohibit one. A matter in which the client has prohibited AI is a matter in which the tool is not opened.

## Known limitations

These files govern Claude Code. They do not govern Cowork, where sessions run on Anthropic servers and files opened through the desktop app are processed there rather than on your machine, and where network egress permissions do not apply to web fetch, web search or MCP servers. They do not prevent a desktop app user selecting a Cloud session, which clones the project folder to an Anthropic-managed virtual machine; on Team or Enterprise that path is closed through the admin console instead.

Claude audit logs capture access metadata and not conversation content, so without your own telemetry there is no record of what was sent.

Settings keys change between releases. The controlling reference is `https://code.claude.com/docs/en/settings`, not this file. Verify key names against it before relying on them, and re-check after a major version.

Configuration cannot answer the underlying questions. Whether the retainer or the client's own engagement terms permit the use, whether the use is confined to the matter, and whether the paragraph 9A satisfaction has been formed and recorded remain judgments for the responsible practitioner.

## Status

Written for Claude Code v2.1.207 and later, July 2026. The settings are tested on macOS and Windows. `hooks/matter-guard.js` requires Node and is tested on Windows; its twenty-two tests pass there.

The platform difference matters and is not cosmetic. The Bash sandbox, which is the only boundary the operating system enforces rather than the client, runs on macOS, Linux and WSL2 and not on native Windows. On Windows the matter boundary is the hook alone, and the hook confines Bash by working directory rather than by inspecting commands, so a shell command can still read across matters. A practice running on Windows should know that it holds the weaker of the two positions, and that running Claude Code inside WSL2 obtains the stronger one.

## Licence

MIT. Adapt freely. Attribution appreciated but not required.

This is published for reference and adaptation rather than as a collaborative project. Issues are disabled and pull requests are not monitored. The two Claude workflows in `.github/workflows` exist for the maintainer's own use on their own pull requests; they are not an invitation, and a pull request from a fork will not have the secrets those workflows need. Fork it and make it yours. Where a key here turns out to be misused or superseded, the controlling reference is `https://code.claude.com/docs/en/settings` rather than this file or its author.
