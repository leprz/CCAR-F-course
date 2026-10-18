# L22 — Exploring a codebase, choosing built-in tools, generating good tests

**Objectives:** O17 (systematic exploration with Grep/Glob/Read under context limits), O32 (Grep vs Glob vs Read vs Bash), O15 (test-generation quality: existing tests as context, fixture conventions, meaningful-test criteria)
**Scenario:** Ledgerly. `workspace.ts` models the search/read tools over the fixture and meters how much text enters context
**Read first:** [Part 8 lecture](../../teach-me/lectures/08-claude-code-configuration/lecture.md), sections 6 (*Finding your way around: choosing tools and exploring incrementally*) and 7 (*Getting tests worth having*)

## Situation

A teammate asked Claude "which routes reach customer data without an authorization check?". The agent read every file
under `src/` in full, filled its context, and reported four routes, three of them wrong: those handlers pass
`req.principal` to a service that checks it. Separately, the tests Claude generates for `computeTotals` pass but prove
nothing (`expect(totals).toBeDefined()`). It never saw the existing tests, the factories or the business rules.

## Your task

1. `TOOL_FOR_TASK`: the right built-in tool for each task in `tool-tasks.ts`.
2. `findUnauthorizedRoutes(ws)`: Glob for route files, Grep for route definitions, Read only windows of 16 lines or
   fewer, and follow the `req.principal` hand-off. Only SEC-3 should come back, and less than ¼ of the codebase may enter context.
3. `buildTestGenPrompt`: the code and its dependency, the existing tests (with the factories), the test conventions,
   explicit "meaningful test" criteria, and the edge cases to cover.
4. `isTrivialTest`: detect tests with no behaviour-pinning assertion.
5. Sandbox: a read-only `codebase-explorer` subagent with a search-first strategy, and a `write-tests` skill that
   injects the existing tests and conventions with `` ```! `` blocks.

```bash
npx vitest lessons/22
SOLUTION=1 npx vitest run lessons/22
npm run test:live -- lessons/22   # generates real tests for computeTotals and checks they aren't trivial
```

When you're done, read `solution/WHY.md`.
