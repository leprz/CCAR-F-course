# Plan: Claude Certified Architect – Foundations practice repo

Goal: pass the CCA-F exam (pass mark 720). Previous attempt scored 481. This repo pairs
researched topic docs with hands-on TypeScript lessons and quizzes that track progress per objective.

Decisions were made in a grill-me session on 2026-10-18. Live status is in `progress.md`.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Source of truth | The score report's 37 objectives (below), with IDs O01–O37 in report order |
| 2 | Depth | All 37 objectives at equal depth (no triage by score) |
| 3 | Lesson tracks | Claude API (`@anthropic-ai/sdk`), Agent SDK (`@anthropic-ai/claude-agent-sdk`), Claude Code config (sandbox folders with their own `.claude/`, checked via `claude -p` and TS tests) |
| 4 | Tests | Structural tests (offline, default) plus opt-in live tests (`*.live.test.ts`, `npm run test:live`, Haiku by default via a `CLAUDE_MODEL` env var) |
| 5 | Docs | One doc per topic (8 topics). Sections are tagged with objective IDs, and `COVERAGE.md` maps objective → doc section → lesson → questions → latest score |
| 6 | Doc accuracy | Researched from current official docs before writing, with source links and a "sources checked" date. SDK versions pinned. Code compiles against real SDK types |
| 7 | Tooling | Node 22, TypeScript strict, `tsx`, Vitest, single npm package, `tsc --noEmit`, no linter |
| 8 | Solutions | `lessons/NN-x/starter/` + `solution/`. `SOLUTION=1` runs the tests against the solution. Each solution has a short "why" section linking to the doc's decision rules |
| 9 | Lesson order | About 22 lessons in 8 parts, ordered by dependency (below) |
| 10 | Examples | Shared exam-style scenarios with fixtures in `fixtures/`: invoices/contracts (extraction), a buggy TS codebase (review), conflicting sources (research/synthesis), support tickets (batch) |
| 11 | Quizzes | Question bank tagged with objective IDs, a per-topic quiz, a weighted mock exam with an *estimated* score out of 720, and progress exported to `progress.json` and then `COVERAGE.md` |
| 12 | Quiz engine | Copy of `~/.claude/skills/teach-me` vendored into `.claude/skills/teach-me/` and extended there (global skill left untouched). Topic docs = teach-me lectures in `teach-me/lectures/<topic>/lecture.md` |
| 13 | Delivery | Vertical slice: scaffold + Part 1, then user review, then Parts 2–8. Context kept in `plan.md` + `progress.md` |

## Quality gate (every lesson)

- Structural tests **fail** against `starter/` and **pass** with `SOLUTION=1`.
- `npx tsc --noEmit` passes.
- Live test passes with `SOLUTION=1 npm run test:live -- <lesson>` (run at least once when the lesson is built).
- Lesson README links its doc section(s) and lists its objective IDs. `COVERAGE.md` is updated.

## Planned layout

```
CLAUDE.md                     project guidance for Claude Code
plan.md / progress.md         this plan + live status
COVERAGE.md                   objective matrix (O01–O37)
package.json, tsconfig.json, vitest.config.ts, .env.example
fixtures/                     shared scenario data
lessons/NN-slug/
  README.md                   task, objectives, doc links
  starter/                    what the learner edits
  solution/                   reference + WHY.md
  *.test.ts                   structural tests (offline)
  *.live.test.ts              opt-in real API tests
  (Claude Code lessons: sandbox/.claude/... instead of / in addition to starter code)
teach-me/lectures/<topic>/    lecture.md (topic doc) + questions.json
.claude/skills/teach-me/      vendored and extended quiz engine
scripts/                      coverage update from progress.json, lesson target switch
```

## teach-me extensions

1. Optional `objectives: ["Oxx"]` field on each question (schema change is additive).
2. Per-objective breakdown on the quiz results screen.
3. `exam.html`: weighted mock exam drawn from all lectures, estimated score out of 720 (labelled as an estimate).
4. "Export progress" → downloads `progress.json`. `npm run coverage` merges it into `COVERAGE.md`.
5. Relax the lecture slug pattern if needed (topic slugs without a date prefix).

## Objectives (from the failed attempt's score report)

| ID | Objective (short) | Last score | Part |
|----|-------------------|-----------:|------|
| O01 | Multiple tool calls in one response turn (parallel) | 0% | 1 |
| O02 | Session resumption: re-analyse changed files, inject context | 100% | 4 |
| O03 | Subagent prompts with all findings, data and source metadata | 67% | 5 |
| O04 | Goal-oriented vs procedural delegation | 0% | 5 |
| O05 | Subagent tool restrictions, context scoping, system prompts | 0% | 5 |
| O06 | Diagnose misconfigured subagent spawning (AgentDefinition, permissions, wiring) | 0% | 5 |
| O07 | Dynamic task decomposition from intermediate findings | 100% | 6 |
| O08 | Plan mode vs direct execution vs multi-phase workflow | 0% | 8 |
| O09 | State persistence for multi-agent pipelines / resumption | 0% | 6 |
| O10 | Orchestration patterns: coordinator-worker, parallel, sequential | 100% | 6 |
| O11 | Claude Code CLI in CI/CD: non-interactive, permission modes, cost/turn limits | 100% | 8 |
| O12 | Iterative refinement: I/O examples, targeted feedback, batched issues | 0% | 2 |
| O13 | Claude Code review configs: standards, restricted tools, structured output | 0% | 8 |
| O14 | `context: fork` for skills/slash commands | 100% | 8 |
| O15 | Test generation quality: existing tests, fixtures, meaningful criteria | 100% | 8 |
| O16 | Choose the config mechanism: CLAUDE.md, .claude/rules globs, Skills, hooks, permissions | 100% | 8 |
| O17 | Systematic codebase exploration with Grep/Glob/Read under context limits | 60% | 8 |
| O18 | Subagent output schemas for downstream synthesis | 100% | 5 |
| O19 | Synthesis keeps source uncertainty, separates established from contested claims | 0% | 6 |
| O20 | Context across sessions: subagent isolation, scratchpads, targeted reads | 0% | 4 |
| O21 | Context window optimisation: summarise, sliding window, state objects, selective retention | 0% | 4 |
| O22 | Human review routing by confidence / document traits / field ambiguity | 33% | 3 |
| O23 | Sync Messages API vs Message Batches API | 50% | 3 |
| O24 | Specialised review passes (security / logic / API) with own few-shots | 0% | 8 |
| O25 | Choose a structured output method: tool schema vs prompt vs prefill | 100% | 2 |
| O26 | Extraction schemas: optional, nullable, enums (no fabrication) | 33% | 2 |
| O27 | Tool use + JSON schema, tool_choice to force invocation | 50% | 1 |
| O28 | Truncation: split into scoped calls and merge, rather than raising max_tokens | 100% | 2 |
| O29 | Extraction accuracy: schemas, normalisation, few-shot | 100% | 2 |
| O30 | Reduce review false positives with persistent project conventions | 100% | 8 |
| O31 | Explicit inclusion/exclusion criteria | 100% | 2 |
| O32 | Choose the built-in tool: Grep / Glob / Read / Bash | 50% | 8 |
| O33 | Tool distribution: each subagent gets only its role's tools | 0% | 5 |
| O34 | MCP resources vs tools | 0% | 7 |
| O35 | MCP integration: scope, env-var auth, tool discovery | 100% | 7 |
| O36 | MCP tool descriptions that prevent misrouting | 100% | 7 |
| O37 | tool_choice + sequencing dependent tool calls | 100% | 1 |

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
