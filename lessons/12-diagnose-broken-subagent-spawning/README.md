# L12 — Diagnose broken subagent spawning

**Objective:** O06 (diagnose misconfigured subagent spawning: missing tool permissions, incorrect `AgentDefinition` parameters, absent coordinator-to-subagent wiring)
**Scenario:** research team, `fixtures/research/`
**Read first:** [Part 5 lecture](../../teach-me/lectures/05-subagents-agent-sdk/lecture.md), sections 2–4, especially 4 (*Why didn't the subagent spawn?*)

## Incident report

A nightly research job (headless, Agent SDK) ships `BROKEN_SETUP` from `starter/index.ts`. The on-call notes say:

| # | Symptom | Your job: which fault(s)? |
|---|---------|---------------------------|
| 1 | The coordinator never delegates and runs every Read/Grep itself | |
| 2 | Even after someone "fixed #1", delegation attempts come back denied, and the run ends with no subagent output | |
| 3 | `web-researcher` is mentioned in the coordinator prompt but never runs | |
| 4 | The source analyst sometimes fails to launch, naming a tool entry | |
| 5 | The coordinator picks the general-purpose agent for document analysis instead of `source-analyst` | |
| 6 | The report writer browsed the web, though its config "only allows Read and Write" | |
| 7 | The fact-checker ignores its instructions and can't fetch the URLs it should verify | |

Nothing errored at config time: these setups arrive as JSON, where TypeScript can't help and unknown fields are
**silently ignored**.

## Your task

1. Implement the rules in `starter/index.ts` (`TODO(1)`–`TODO(7)`). `missingRequiredField` is a worked example.
2. `TODO(8)`: write `FIXED_SETUP` so that `diagnose` finds nothing and every agent keeps least-privilege tools.
3. Fill in the right-hand column of the table above, then compare with `solution/WHY.md`.

```bash
npx vitest lessons/12
npx vitest run lessons/12 -t "TODO\(2\)"
SOLUTION=1 npx vitest run lessons/12
```

The point is to find faults *before* paying for a run. The live test (`npm run test:live -- lessons/12`) only checks that
`FIXED_SETUP` really delegates. To see a fault live, remove `'Agent'` from its `allowedTools` and watch the delegation get denied.
