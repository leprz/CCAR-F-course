# L20 — Review configurations and specialised review passes

**Objectives:** O13 (review config: right standards, restricted tools, structured output), O24 (separate security / logic / API passes with their own few-shots), O30 (cut false positives with persistent conventions)
**Scenario:** Ledgerly (`fixtures/codebase/`). `answer-key.ts` encodes `ISSUES.md`: 9 seeded issues and 6 accepted patterns
**Read first:** [Part 8 lecture](../../teach-me/lectures/08-claude-code-configuration/lecture.md), section 3 (*Configuring automated review: standards, tools, passes and false positives*)

## Situation

Ledgerly's automated review is one prompt: "find all bugs, security issues, API problems and anything else". It returns
free text that the CI step can't parse. It misses the authorization bug while it's busy with rounding, and it keeps
flagging things the team explicitly allows: `any` in legacy code, the logger's empty `catch`, `Math.random()` for
request ids. The Claude Code side has one `reviewer` subagent with no tool list (so it inherits every tool, including
Edit and Bash) that is told to "fix what you can".

## Your task

1. `FINDINGS_TOOL`: a real schema with enums, a nullable `line`, the `rule` violated, and every field required.
2. `PASSES`: three focused passes (security, business-logic, api-design). Each one names its concern and what to
   ignore, and has at least 2 few-shot findings of its own category plus a "looks suspicious, is fine" example.
3. `persistentContext`: include CONVENTIONS.md, with its accepted patterns, plus exclusion criteria, in **every** pass.
4. `buildPassRequest`: focus + conventions + examples in the system prompt, forced `report_findings`, and the source files.
5. `runReview`: run the passes concurrently, drop out-of-lane findings, merge and de-duplicate.
6. Sandbox: three read-only reviewer subagents (`tools: Read, Grep, Glob`) that apply the accepted patterns and return
   JSON, `@CONVENTIONS.md` imported from CLAUDE.md, and `.claude/review-schema.json` for `--json-schema` in CI.

```bash
npx vitest lessons/20
SOLUTION=1 npx vitest run lessons/20
npm run test:live -- lessons/20    # real review over Ledgerly, scored against ISSUES.md: recall ≥ 0.5, ≤ 1 false positive
```

When you're done, read `solution/WHY.md`.
