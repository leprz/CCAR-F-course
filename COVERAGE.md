# Coverage matrix

Each exam objective (IDs from `plan.md`) mapped to the doc section, lesson and quiz that cover it.
`Report` = score on the failed attempt (481 / 720). `Latest quiz` is filled in by `npm run coverage` from a `progress.json` exported from the quiz portal.

<!-- coverage:start -->
| ID | Objective | Report | Part | Doc | Lesson | Latest quiz |
|----|-----------|-------:|-----:|-----|--------|-------------|
| O01 | Multiple tool calls in one response turn (parallel) | 0% | 1 | [Part 1 › Parallel tool calls](teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md) | [L02](lessons/02-parallel-tool-calls/) | – |
| O02 | Session resumption: re-analyse changed files, inject context | 100% | 4 | planned | L10 | – |
| O03 | Subagent prompts with all findings, data and source metadata | 67% | 5 | planned | L13 | – |
| O04 | Goal-oriented vs procedural delegation | 0% | 5 | planned | L13 | – |
| O05 | Subagent tool restrictions, context scoping, system prompts | 0% | 5 | planned | L11 | – |
| O06 | Diagnose misconfigured subagent spawning (AgentDefinition, permissions, wiring) | 0% | 5 | planned | L12 | – |
| O07 | Dynamic task decomposition from intermediate findings | 100% | 6 | planned | L14 | – |
| O08 | Plan mode vs direct execution vs multi-phase workflow | 0% | 8 | planned | L21 | – |
| O09 | State persistence for multi-agent pipelines / resumption | 0% | 6 | planned | L15 | – |
| O10 | Orchestration patterns: coordinator-worker, parallel, sequential | 100% | 6 | planned | L14 | – |
| O11 | Claude Code CLI in CI/CD: non-interactive, permission modes, cost/turn limits | 100% | 8 | planned | L21 | – |
| O12 | Iterative refinement: I/O examples, targeted feedback, batched issues | 0% | 2 | planned | L06 | – |
| O13 | Claude Code review configs: standards, restricted tools, structured output | 0% | 8 | planned | L20 | – |
| O14 | `context: fork` for skills/slash commands | 100% | 8 | planned | L19 | – |
| O15 | Test generation quality: existing tests, fixtures, meaningful criteria | 100% | 8 | planned | L22 | – |
| O16 | Choose the config mechanism: CLAUDE.md, .claude/rules globs, Skills, hooks, permissions | 100% | 8 | planned | L19 | – |
| O17 | Systematic codebase exploration with Grep/Glob/Read under context limits | 60% | 8 | planned | L22 | – |
| O18 | Subagent output schemas for downstream synthesis | 100% | 5 | planned | L13 | – |
| O19 | Synthesis keeps source uncertainty, separates established from contested claims | 0% | 6 | planned | L16 | – |
| O20 | Context across sessions: subagent isolation, scratchpads, targeted reads | 0% | 4 | planned | L10 | – |
| O21 | Context window optimisation: summarise, sliding window, state objects, selective retention | 0% | 4 | planned | L09 | – |
| O22 | Human review routing by confidence / document traits / field ambiguity | 33% | 3 | planned | L08 | – |
| O23 | Sync Messages API vs Message Batches API | 50% | 3 | planned | L07 | – |
| O24 | Specialised review passes (security / logic / API) with own few-shots | 0% | 8 | planned | L20 | – |
| O25 | Choose a structured output method: tool schema vs prompt vs prefill | 100% | 2 | planned | L03 | – |
| O26 | Extraction schemas: optional, nullable, enums (no fabrication) | 33% | 2 | planned | L03 | – |
| O27 | Tool use + JSON schema, tool_choice to force invocation | 50% | 1 | [Part 1 › Forcing tools](teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md) | [L01](lessons/01-tool-loop-and-tool-choice/) | – |
| O28 | Truncation: split into scoped calls and merge, rather than raising max_tokens | 100% | 2 | planned | L05 | – |
| O29 | Extraction accuracy: schemas, normalisation, few-shot | 100% | 2 | planned | L04 | – |
| O30 | Reduce review false positives with persistent project conventions | 100% | 8 | planned | L20 | – |
| O31 | Explicit inclusion/exclusion criteria | 100% | 2 | planned | L04 | – |
| O32 | Choose the built-in tool: Grep / Glob / Read / Bash | 50% | 8 | planned | L22 | – |
| O33 | Tool distribution: each subagent gets only its role's tools | 0% | 5 | planned | L11 | – |
| O34 | MCP resources vs tools | 0% | 7 | planned | L17 | – |
| O35 | MCP integration: scope, env-var auth, tool discovery | 100% | 7 | planned | L18 | – |
| O36 | MCP tool descriptions that prevent misrouting | 100% | 7 | planned | L17 | – |
| O37 | tool_choice + sequencing dependent tool calls | 100% | 1 | [Part 1 › Sequencing](teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md) | [L01](lessons/01-tool-loop-and-tool-choice/) | – |
<!-- coverage:end -->
