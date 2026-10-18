# Why the solution looks like this

## Symptom → fault

| # | Symptom | Fault (finding code) | Fix |
|---|---------|----------------------|-----|
| 1 | Coordinator does everything itself | `options.tools: ['Read','Grep','Glob']` has no `Agent` → **SPAWN_TOOL_UNAVAILABLE** | Add `Agent` to the base tools (or the main-thread agent's `tools`) |
| 2 | Delegation denied in the headless run | `allowedTools` lacks `Agent` while `permissionMode: 'dontAsk'` → **SPAWN_TOOL_NOT_APPROVED** | Add `Agent` to `allowedTools` (or `canUseTool`) |
| 3 | `web-researcher` never runs | Mentioned in the prompt, missing from `options.agents` → **AGENT_NOT_REGISTERED** | Register its `AgentDefinition` |
| 4 | Analyst fails to launch | `'grep'` (lowercase) doesn't resolve → **UNKNOWN_TOOL** | Use `Grep`. Tool names are case-sensitive |
| 5 | General-purpose agent picked instead | `description: 'Analyst'` → **VAGUE_DESCRIPTION** | Say what it does + "Use for…" |
| 6 | Writer browsed the web | `allowedTools` inside an AgentDefinition is **not a field** → ignored → no `tools` → **inherits every tool** (**UNKNOWN_FIELD**) | Use `tools: ['Read','Write']` |
| 7 | Fact-checker ignores instructions, can't fetch | `systemPrompt` isn't a field (it's `prompt`) → **UNKNOWN_FIELD** + **MISSING_REQUIRED_FIELD**; `WebFetch` in both lists → **TOOL_CONFLICT** (deny wins) | Rename to `prompt`; drop the conflicting deny |

## Design choices

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Separate "unavailable" and "not approved" checks | Availability (`tools`) and approval (`allowedTools`, `permissionMode`, `canUseTool`) are different layers. A tool can be available but denied, or approved but absent. | The exam's favourite confusion: "add it to allowedTools" when the tool isn't in the tool set at all, or the reverse |
| Accept `Agent` **and** `Task` | `Task` is the pre-v2.1.63 name, still shown in `system:init`. | Renamed-tool distractors |
| Unknown fields are findings, not ignored | The SDK and agent-file frontmatter **silently ignore** unrecognised fields. Typos like `allowedTools`, `system_prompt` or `systemPrompt` produce agents that run with defaults. | "Config says X but agent does Y" |
| Description quality is checked | Routing is driven by `description`. A one-word description means the coordinator falls back to `general-purpose` or does the work itself. | "Subagent is never invoked" |
| `TOOL_CONFLICT` | `disallowedTools` is applied after `tools`, so the tool disappears. | Agent "can't" do its job |
| Static linting before running | Cheaper than a failed overnight run, and works headless. | Diagnose-from-config questions |

Not linted here but worth knowing: a subagent at the depth limit loses `Agent`;
`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` makes an Agent call without `subagent_type` fail; file-based agents in a newly
created `.claude/agents/` directory need a session restart; and programmatic `agents` override a file agent with the same name.
