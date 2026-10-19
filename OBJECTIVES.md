# Exam objectives

The 37 objectives from the exam's score report, numbered O01–O37 in report order. Every lecture section, lesson and
quiz question is tagged with these IDs. Results per objective are in the portal (quiz results, mock exam, *Export progress*).

## Objectives

| ID | Objective (short) | Part |
|----|-------------------|------|
| O01 | Multiple tool calls in one response turn (parallel) | 1 |
| O02 | Session resumption: re-analyse changed files, inject context | 4 |
| O03 | Subagent prompts with all findings, data and source metadata | 5 |
| O04 | Goal-oriented vs procedural delegation | 5 |
| O05 | Subagent tool restrictions, context scoping, system prompts | 5 |
| O06 | Diagnose misconfigured subagent spawning (AgentDefinition, permissions, wiring) | 5 |
| O07 | Dynamic task decomposition from intermediate findings | 6 |
| O08 | Plan mode vs direct execution vs multi-phase workflow | 8 |
| O09 | State persistence for multi-agent pipelines / resumption | 6 |
| O10 | Orchestration patterns: coordinator-worker, parallel, sequential | 6 |
| O11 | Claude Code CLI in CI/CD: non-interactive, permission modes, cost/turn limits | 8 |
| O12 | Iterative refinement: I/O examples, targeted feedback, batched issues | 2 |
| O13 | Claude Code review configs: standards, restricted tools, structured output | 8 |
| O14 | `context: fork` for skills/slash commands | 8 |
| O15 | Test generation quality: existing tests, fixtures, meaningful criteria | 8 |
| O16 | Choose the config mechanism: CLAUDE.md, .claude/rules globs, Skills, hooks, permissions | 8 |
| O17 | Systematic codebase exploration with Grep/Glob/Read under context limits | 8 |
| O18 | Subagent output schemas for downstream synthesis | 5 |
| O19 | Synthesis keeps source uncertainty, separates established from contested claims | 6 |
| O20 | Context across sessions: subagent isolation, scratchpads, targeted reads | 4 |
| O21 | Context window optimisation: summarise, sliding window, state objects, selective retention | 4 |
| O22 | Human review routing by confidence / document traits / field ambiguity | 3 |
| O23 | Sync Messages API vs Message Batches API | 3 |
| O24 | Specialised review passes (security / logic / API) with own few-shots | 8 |
| O25 | Choose a structured output method: tool schema vs prompt vs prefill | 2 |
| O26 | Extraction schemas: optional, nullable, enums (no fabrication) | 2 |
| O27 | Tool use + JSON schema, tool_choice to force invocation | 1 |
| O28 | Truncation: split into scoped calls and merge, rather than raising max_tokens | 2 |
| O29 | Extraction accuracy: schemas, normalisation, few-shot | 2 |
| O30 | Reduce review false positives with persistent project conventions | 8 |
| O31 | Explicit inclusion/exclusion criteria | 2 |
| O32 | Choose the built-in tool: Grep / Glob / Read / Bash | 8 |
| O33 | Tool distribution: each subagent gets only its role's tools | 5 |
| O34 | MCP resources vs tools | 7 |
| O35 | MCP integration: scope, env-var auth, tool discovery | 7 |
| O36 | MCP tool descriptions that prevent misrouting | 7 |
| O37 | tool_choice + sequencing dependent tool calls | 1 |

## Parts and lessons

Each part has one topic doc (lecture) and one quiz. Scenario in brackets.

**Part 1 — Agentic loop & tool use** (API) [support tickets]
- L01 Tool-use loop, `tool_choice` forcing, dependent tool sequencing — O27, O37
- L02 Parallel tool calls in one turn — O01

**Part 2 — Structured output & extraction** (API) [invoices/contracts]
- L03 Choosing the output method + extraction schema design (nullable/optional/enum) — O25, O26
- L04 Accuracy patterns + inclusion/exclusion criteria — O29, O31
- L05 Truncation: split and merge — O28
- L06 Iterative refinement loop — O12

**Part 3 — Processing modes & review routing** (API) [support tickets, invoices]
- L07 Messages vs Message Batches — O23
- L08 Confidence-based human review routing — O22

**Part 4 — Context management** (API + Agent SDK) [buggy codebase]
- L09 Context window optimisation — O21
- L10 Cross-session context: scratchpads, isolation, resumption — O20, O02

**Part 5 — Subagents with the Agent SDK** [research sources]
- L11 AgentDefinition: role tools, scoping, system prompts — O05, O33
- L12 Diagnose broken subagent spawning — O06
- L13 Delegation style, complete subagent prompts, output schemas — O04, O03, O18

**Part 6 — Multi-agent orchestration** (Agent SDK) [research sources]
- L14 Orchestration patterns + dynamic decomposition — O10, O07
- L15 Pipeline state persistence and resumption — O09
- L16 Synthesis that keeps uncertainty — O19

**Part 7 — MCP** (Agent SDK + Claude Code)
- L17 Resources vs tools, tool descriptions — O34, O36
- L18 Server scope, env-var auth, discovery — O35

**Part 8 — Claude Code configuration** (sandboxes) [buggy codebase]
- L19 Choosing the config mechanism + `context: fork` — O16, O14
- L20 Review config, specialised passes, false-positive control — O13, O24, O30
- L21 Plan mode / direct / multi-phase + CI flags — O08, O11
- L22 Exploration strategy, built-in tool choice, test generation — O17, O32, O15
