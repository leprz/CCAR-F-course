# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Explicit `tools` on every subagent | Omitting `tools` **inherits every tool available to subagents**. A listed tool set is the only way to enforce a role. A tool that isn't listed isn't in the session at all, so there's no prompt and no error. | "Analyst modified files" / "writer browsed the web" → missing `tools` allowlist |
| `source-analyst: Read, Grep, Glob` | The docs' "read-only analysis" combination. It can examine files but not modify or execute. | Read-only reviewer questions |
| `web-researcher: WebSearch, WebFetch` only | Fewer tools mean fewer wrong choices and a smaller blast radius. | O33: "reducing decision complexity and preventing out-of-role tool invocations" |
| No `Agent` in specialist tools | Subagents **can** nest (default depth 3 since Claude Code v2.1.219). Leaving `Agent` out (or adding it to `disallowedTools`) stops a specialist spawning more agents. | Older material says "subagents can't spawn subagents". That's no longer the default. |
| Coordinator as main-thread agent (`agent: 'coordinator'`) with `tools: ['Agent','Read','Glob']` | `Options.agent` applies that definition's prompt, tools and model to the main conversation, so the coordinator literally cannot search or write. A system-prompt instruction alone is only a request. | "Coordinator does the work itself instead of delegating" |
| Descriptions with "Use for… / Use when…" | Claude picks subagents by `description`. Vague descriptions mean no delegation, or the wrong agent. | Delegation-not-happening questions |
| `allowedTools` = spawn tool + every role tool | `allowedTools` **auto-approves**. It doesn't grant availability. In headless mode an unapproved tool can't be approved by anyone. | Missing `Agent` in `allowedTools` → delegation denied |
| `permissionMode: 'dontAsk'` | In a headless run, unapproved calls are denied immediately instead of waiting for a prompt. | CI / automation permission questions |
| `settingSources: []` | SDK isolation mode: no user/project/local settings and no CLAUDE.md leak in from the developer's machine. Include `'project'` when you *want* CLAUDE.md. | O05 "context scoping" |
| `maxTurns`, `maxBudgetUsd` | Subagent API calls count toward the query's spend. The budget cap also refuses new spawns (`Budget limit reached`). | Runaway-cost questions |
| Match both `Agent` and `Task` | Detecting delegations across SDK versions, as the SDK docs recommend. | Renamed-tool distractors |

Also know: `model` per subagent (`haiku` for cheap extraction, `inherit` for the main model), `disallowedTools` as a denylist
alternative, `Agent(worker, researcher)` in a **main-thread** agent's `tools` to allowlist spawnable types, and
`.claude/agents/*.md` files (frontmatter `name`, `description`, `tools`, `model`, …) as the filesystem equivalent.
Programmatic `agents` override a file-based agent with the same name.
