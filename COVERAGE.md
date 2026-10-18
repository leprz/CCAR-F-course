# Coverage matrix

Each exam objective (IDs from `plan.md`) mapped to the doc section, lesson and quiz that cover it.
`Report` = score on the failed attempt (481 / 720). `Latest quiz` is filled in by `npm run coverage` from a `progress.json` exported from the quiz portal.

<!-- coverage:start -->
| ID | Objective | Report | Part | Doc | Lesson | Latest quiz |
|----|-----------|-------:|-----:|-----|--------|-------------|
| O01 | Multiple tool calls in one response turn (parallel) | 0% | 1 | [Part 1 › Parallel tool calls](teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md) | [L02](lessons/02-parallel-tool-calls/) | – |
| O02 | Session resumption: re-analyse changed files, inject context | 100% | 4 | [Part 4 › §5 Resuming](teach-me/lectures/04-context-management/lecture.md) | [L10](lessons/10-cross-session-context/) | – |
| O03 | Subagent prompts with all findings, data and source metadata | 67% | 5 | [Part 5 › §6 What the delegation prompt carries](teach-me/lectures/05-subagents-agent-sdk/lecture.md) | [L13](lessons/13-delegation-prompts-and-output-schemas/) | – |
| O04 | Goal-oriented vs procedural delegation | 0% | 5 | [Part 5 › §5 Goals or steps](teach-me/lectures/05-subagents-agent-sdk/lecture.md) | [L13](lessons/13-delegation-prompts-and-output-schemas/) | – |
| O05 | Subagent tool restrictions, context scoping, system prompts | 0% | 5 | [Part 5 › §1–3 Context, definitions, tools](teach-me/lectures/05-subagents-agent-sdk/lecture.md) | [L11](lessons/11-agent-definitions-and-tool-scoping/) | – |
| O06 | Diagnose misconfigured subagent spawning (AgentDefinition, permissions, wiring) | 0% | 5 | [Part 5 › §4 Why didn't the subagent spawn?](teach-me/lectures/05-subagents-agent-sdk/lecture.md) | [L12](lessons/12-diagnose-broken-subagent-spawning/) | – |
| O07 | Dynamic task decomposition from intermediate findings | 100% | 6 | [Part 6 › §3 Findings decide the next step](teach-me/lectures/06-multi-agent-orchestration/lecture.md) | [L14](lessons/14-orchestration-patterns-and-dynamic-decomposition/) | – |
| O08 | Plan mode vs direct execution vs multi-phase workflow | 0% | 8 | [Part 8 › §4 Plan mode vs direct vs multi-phase](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L21](lessons/21-plan-mode-workflows-and-ci/) | – |
| O09 | State persistence for multi-agent pipelines / resumption | 0% | 6 | [Part 6 › §4 Surviving a crash](teach-me/lectures/06-multi-agent-orchestration/lecture.md) | [L15](lessons/15-pipeline-state-persistence/) | – |
| O10 | Orchestration patterns: coordinator-worker, parallel, sequential | 100% | 6 | [Part 6 › §1–2 Choosing a structure](teach-me/lectures/06-multi-agent-orchestration/lecture.md) | [L14](lessons/14-orchestration-patterns-and-dynamic-decomposition/) | – |
| O11 | Claude Code CLI in CI/CD: non-interactive, permission modes, cost/turn limits | 100% | 8 | [Part 8 › §5 Claude Code in CI](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L21](lessons/21-plan-mode-workflows-and-ci/) | – |
| O12 | Iterative refinement: I/O examples, targeted feedback, batched issues | 0% | 2 | [Part 2 › §6 Improving without going in circles](teach-me/lectures/02-structured-output-and-extraction/lecture.md) | [L06](lessons/06-iterative-refinement/) | – |
| O13 | Claude Code review configs: standards, restricted tools, structured output | 0% | 8 | [Part 8 › §3 Automated review](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L20](lessons/20-review-configs-and-specialized-passes/) | – |
| O14 | `context: fork` for skills/slash commands | 100% | 8 | [Part 8 › §2 context: fork](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L19](lessons/19-config-mechanisms-and-context-fork/) | – |
| O15 | Test generation quality: existing tests, fixtures, meaningful criteria | 100% | 8 | [Part 8 › §7 Tests worth having](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L22](lessons/22-exploration-tools-and-test-generation/) | – |
| O16 | Choose the config mechanism: CLAUDE.md, .claude/rules globs, Skills, hooks, permissions | 100% | 8 | [Part 8 › §1 Where should this instruction live?](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L19](lessons/19-config-mechanisms-and-context-fork/) | – |
| O17 | Systematic codebase exploration with Grep/Glob/Read under context limits | 60% | 8 | [Part 8 › §6 Choosing tools, exploring](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L22](lessons/22-exploration-tools-and-test-generation/) | – |
| O18 | Subagent output schemas for downstream synthesis | 100% | 5 | [Part 5 › §7 What the subagent sends back](teach-me/lectures/05-subagents-agent-sdk/lecture.md) | [L13](lessons/13-delegation-prompts-and-output-schemas/) | – |
| O19 | Synthesis keeps source uncertainty, separates established from contested claims | 0% | 6 | [Part 6 › §5–6 Synthesis that keeps the doubt](teach-me/lectures/06-multi-agent-orchestration/lecture.md) | [L16](lessons/16-synthesis-preserving-uncertainty/) | – |
| O20 | Context across sessions: subagent isolation, scratchpads, targeted reads | 0% | 4 | [Part 4 › §4 Working beyond one context](teach-me/lectures/04-context-management/lecture.md) | [L10](lessons/10-cross-session-context/) | – |
| O21 | Context window optimisation: summarise, sliding window, state objects, selective retention | 0% | 4 | [Part 4 › §1–3](teach-me/lectures/04-context-management/lecture.md) | [L09](lessons/09-context-window-optimization/) | – |
| O22 | Human review routing by confidence / document traits / field ambiguity | 33% | 3 | [Part 3 › §4–6 Routing to human review](teach-me/lectures/03-processing-modes-and-review-routing/lecture.md) | [L08](lessons/08-human-review-routing/) | – |
| O23 | Sync Messages API vs Message Batches API | 50% | 3 | [Part 3 › §1–3 Messages vs Batches](teach-me/lectures/03-processing-modes-and-review-routing/lecture.md) | [L07](lessons/07-messages-vs-batches/) | – |
| O24 | Specialised review passes (security / logic / API) with own few-shots | 0% | 8 | [Part 8 › §3 Automated review](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L20](lessons/20-review-configs-and-specialized-passes/) | – |
| O25 | Choose a structured output method: tool schema vs prompt vs prefill | 100% | 2 | [Part 2 › §1 JSON you can trust](teach-me/lectures/02-structured-output-and-extraction/lecture.md) | [L03](lessons/03-structured-output-and-extraction-schema/) | – |
| O26 | Extraction schemas: optional, nullable, enums (no fabrication) | 33% | 2 | [Part 2 › §2 When the document doesn't say](teach-me/lectures/02-structured-output-and-extraction/lecture.md) | [L03](lessons/03-structured-output-and-extraction-schema/) | – |
| O27 | Tool use + JSON schema, tool_choice to force invocation | 50% | 1 | [Part 1 › Forcing tools](teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md) | [L01](lessons/01-tool-loop-and-tool-choice/) | – |
| O28 | Truncation: split into scoped calls and merge, rather than raising max_tokens | 100% | 2 | [Part 2 › §5 When the answer doesn't fit](teach-me/lectures/02-structured-output-and-extraction/lecture.md) | [L05](lessons/05-truncation-split-and-merge/) | – |
| O29 | Extraction accuracy: schemas, normalisation, few-shot | 100% | 2 | [Part 2 › §3 Values right, not just shape](teach-me/lectures/02-structured-output-and-extraction/lecture.md) | [L04](lessons/04-extraction-accuracy-and-criteria/) | – |
| O30 | Reduce review false positives with persistent project conventions | 100% | 8 | [Part 8 › §3 Automated review](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L20](lessons/20-review-configs-and-specialized-passes/) | – |
| O31 | Explicit inclusion/exclusion criteria | 100% | 2 | [Part 2 › §4 Where the model should refuse](teach-me/lectures/02-structured-output-and-extraction/lecture.md) | [L04](lessons/04-extraction-accuracy-and-criteria/) | – |
| O32 | Choose the built-in tool: Grep / Glob / Read / Bash | 50% | 8 | [Part 8 › §6 Choosing tools, exploring](teach-me/lectures/08-claude-code-configuration/lecture.md) | [L22](lessons/22-exploration-tools-and-test-generation/) | – |
| O33 | Tool distribution: each subagent gets only its role's tools | 0% | 5 | [Part 5 › §3 Which tools each agent gets](teach-me/lectures/05-subagents-agent-sdk/lecture.md) | [L11](lessons/11-agent-definitions-and-tool-scoping/) | – |
| O34 | MCP resources vs tools | 0% | 7 | [Part 7 › §1–2 Resources vs tools](teach-me/lectures/07-mcp/lecture.md) | [L17](lessons/17-mcp-resources-vs-tools/) | – |
| O35 | MCP integration: scope, env-var auth, tool discovery | 100% | 7 | [Part 7 › §4–6 Scope, credentials, discovery](teach-me/lectures/07-mcp/lecture.md) | [L18](lessons/18-mcp-integration-scope-auth/) | – |
| O36 | MCP tool descriptions that prevent misrouting | 100% | 7 | [Part 7 › §3 Choosing between similar tools](teach-me/lectures/07-mcp/lecture.md) | [L17](lessons/17-mcp-resources-vs-tools/) | – |
| O37 | tool_choice + sequencing dependent tool calls | 100% | 1 | [Part 1 › Sequencing](teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md) | [L01](lessons/01-tool-loop-and-tool-choice/) | – |
<!-- coverage:end -->
