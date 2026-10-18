# L13 — Delegation style, self-contained subagent prompts, output schemas

**Objectives:** O04 (goal-oriented vs procedural delegation), O03 (subagent prompts that carry all findings, structured data and source metadata), O18 (subagent output schemas for downstream synthesis)
**Scenario:** research team, `fixtures/research/`
**Read first:** [Part 5 lecture](../../teach-me/lectures/05-subagents-agent-sdk/lecture.md), sections 5–7 (*Should the coordinator give goals or steps?*, *What must the delegation prompt carry?* and *What should the subagent send back?*)

## Situation

The coordinator's delegations look like this:

```text
Research this: output impact
1. Open each source file.
2. Read it from top to bottom.
3. Write down anything relevant.
4. Summarise what you found.
Sources: S2, S5, S6, S9
```

Each subagent starts with a fresh context, so the step list above is **all** it knows. It doesn't know the research
question, what is already established, which source is a vendor whitepaper, or what another analyst is covering. It
re-reads what was already covered, it can't adapt when a source turns out to be off-topic, and it returns prose. The
synthesis step can't tell which claim came from which source, or how recent that source was.

## Your task

Edit `starter/index.ts`:

1. `SUBAGENT_OUTPUT_SCHEMA`: a schema for synthesis. Findings carry claim, quote, source id, date, type, stance and
   confidence. It also lists gaps, and which sources were used or discounted and why.
2. `chooseDelegationStyle`: goal-oriented unless a procedure is mandated.
3. `buildDelegationPrompt`: a goal-oriented, self-contained prompt with the objective, success criteria, scope, prior
   findings, source metadata, constraints and the report format. No numbered steps.
4. `parseSubagentReport`: get the JSON out of prose and code fences, then reject what synthesis can't trust, listing every error.
5. `toSynthesisInput`: merge the reports by claim **without losing citations**.

```bash
npx vitest lessons/13
SOLUTION=1 npx vitest run lessons/13
npm run test:live -- lessons/13    # runs your prompt through a real read-only agent and parses its report
```

When you're done, read `solution/WHY.md`.
