# Configuration reference

There is no application .env loader. Checked-in JSON templates and test-fixtures/synthetic-production.json are the configuration examples. Renderer environment variables are optional alternatives to CLI flags; flags win. Never put real credentials or deployment identifiers in Git.

## Renderer inputs

| Flag | Environment alternative | Required / format |
|---|---|---|
| --firm-name | CLAUDE_FIRM_NAME | Required nonempty practice label; synthetic label for tests. |
| --org-uuid | CLAUDE_ORG_UUID | Required valid UUID belonging to the intended account in deployment. Example UUIDs do not authenticate. |
| --matter-roots | CLAUDE_MATTER_ROOTS | Required absolute POSIX parent root(s), semicolon separated. Direct children are matters. |
| --sandbox-policy | CLAUDE_SANDBOX_POLICY | Required local JSON generated for one selected child matter. |
| --otel-endpoint | OTEL_EXPORTER_OTLP_ENDPOINT | Required HTTPS collector base URL unless --disable-telemetry is explicit. No credentials, query or fragment in the URL. |
| --hook-path | CLAUDE_HOOK_PATH | Optional absolute POSIX installed script path; defaults to /etc/claude-code/hooks/matter-guard.js. |

Missing or invalid inputs exit nonzero before writing. The renderer refuses an existing output unless --force is given. dist/ is gitignored but still requires appropriate host permissions and exclusion from consumer sync. No variables are required to run the offline suite.

## Hook runtime

These belong in the installed managed settings env object, not just the build shell:

| Variable | Default / rule |
|---|---|
| CLAUDE_MATTER_ROOTS | Required actual parent directories, separated by semicolons; placeholders, nested ambiguity and unresolved roots fail closed. |
| CLAUDE_MATTER_MODE | enforce when absent; valid values enforce, warn, off. Template deliberately uses warn; deployments require enforce. |
| CLAUDE_MATTER_STATE_DIR | Optional absolute private local state directory; default claude-matter-guard under LOCALAPPDATA or the user's home. Must persist across hook invocations. |
| CLAUDE_MATTER_ARCHIVE | Optional single folder name; default _ai-record. No traversal or separators. |
| CLAUDE_RECORD_ROOT | Optional absolute central archive parent; otherwise copy under each matter. Use a distinct approved records location. |

Bind these paths within the selected container's mounts. Do not share state with untrusted users. Archive data is plaintext unless the filesystem encrypts it. See [operations](operations.md) before changing roots or archive locations.

## Managed telemetry and privacy defaults

CLAUDE_CODE_ENABLE_TELEMETRY=1 selects telemetry. OTEL_METRICS_EXPORTER=otlp and OTEL_LOGS_EXPORTER=otlp select signals, OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf sets transport, and OTEL_EXPORTER_OTLP_ENDPOINT supplies the base URL. Signal paths are derived by the exporter: do not use /v1/traces as the generic endpoint.

OTEL_LOG_USER_PROMPTS, OTEL_LOG_ASSISTANT_RESPONSES, OTEL_LOG_TOOL_DETAILS, OTEL_LOG_TOOL_CONTENT and OTEL_LOG_RAW_API_BODIES are explicitly 0. Leaving them unset allows an inherited value to collect content. --disable-telemetry disables export explicitly; this needs a recorded alternative to metadata collection for client use.

CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, DISABLE_FEEDBACK_COMMAND and CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY are 1 in the managed template. settings.json additionally disables telemetry/error reporting for personal convenience. These are client controls, not supplier contract or retention guarantees.

CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 removes supported credential variables from child-process environments. This does not remove credentials from host files or isolate process inspection; verify the actual container and credential delivery path.

## Test and CI inputs

- PYTHON selects the interpreter for Python-backed Node tests. scripts/verify.py supplies its own interpreter.
- CLAUDE_E2E=1 opts into real model calls; unset means an explicit skip.
- CLAUDE_E2E_CLI optionally selects an absolute native Claude executable or installed CLI JavaScript entry point. On Windows use the native executable or npm package CLI entry, not a shell command string. Otherwise the harness resolves the installed CLI.
- CLAUDE_COMPLIANCE_LIVE=1 enables `node tests/compliance-live.js`, six optional synthetic model-behavior samples using the actual Skill tool. It uses the same CLAUDE_E2E_CLI input.
- CLAUDE_COMPLIANCE_OUTPUT optionally names a local JSON output path for those synthetic responses and check results. Keep output outside Git; it is intended for human evaluation, not real matter data.
- CLAUDE_CODE_OAUTH_TOKEN is an optional GitHub Actions secret. It is not required for offline tests or a locally authenticated CLI.
- ENABLE_CLAUDE_WORKFLOW=true is a GitHub repository variable required to activate the optional maintainer assistant, alongside trusted-actor permission checks. The recorded token rotation remains outstanding; see [OAuth decision](policy-decisions/oauth-token-management.md).

The live GitHub workflow was also manually disabled during the review. An enable variable alone cannot restart it. Follow the OAuth decision's current evidence/rotation procedure before explicit re-enablement. Production preflight accepts a disabled disposition only with a same-day verified API observation matching this checkout and workflow hash.

## Single-matter definition example

Copy [examples/matter-definition.json](../examples/matter-definition.json) to a controlled working directory. root is a selected matter directory, unlike CLAUDE_MATTER_ROOTS (its parent). aliases must remain inside that selected root; allowed_tooling_paths must be narrow runtime locations; allowed_domains must be exact hostnames. record_root=null uses the matter archive. Target-side realpath, mount visibility and network observation remain required; validation on another host cannot establish those facts.
