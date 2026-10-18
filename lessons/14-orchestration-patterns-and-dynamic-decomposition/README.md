# L14 — Orchestration patterns and dynamic decomposition

**Objectives:** O10 (choose coordinator-worker, parallel or sequential structures for coverage, latency and reliability), O07 (decompose into subtasks that adapt to what is discovered)
**Scenario:** research team, `fixtures/research/` (four-day week and software team productivity)
**Read first:** [Part 6 lecture](../../teach-me/lectures/06-multi-agent-orchestration/lecture.md), sections 1–3 (*Do you need more than one agent?* through *Letting the findings decide the next step*)

## Situation

The research coordinator was built in an afternoon. Every request, even "what year was S7 published?", gets a
coordinator plus workers. The coordinator's plan is fixed: survey wellbeing, output and retention, one after another,
and stop. It never notices that the sources also talk about on-call coverage and collaboration. It never follows up
when the output evidence contradicts itself (a randomised study says −9%, four others say "no change"). Leadership
gets a brief with blind spots, slowly.

## Your task

Edit `starter/index.ts`:

1. `choosePattern`: the simplest structure that fits. A single agent for simple or tightly coupled work, a
   sequential pipeline when steps consume each other's output, parallel fan-out for known independent subtasks,
   and a coordinator when the subtasks can't be predicted.
2. `effortFor`: the effort-scaling rules (agents and tool calls by complexity).
3. `runResearch`: run each round's tasks **concurrently**.
4. `findConflicts`: claims whose findings point in more than one direction.
5. `nextTasks`: turn leads into new surveys and conflicts into one targeted follow-up each, never planning anything twice.
6. `runResearch`: loop round after round until nothing new is planned, within `maxRounds` / `maxTasks`, and **report**
   whatever the budget cut off as `unexplored`.

```bash
npx vitest lessons/14
SOLUTION=1 npx vitest run lessons/14
npm run test:live -- lessons/14    # real workers (Haiku), max 7 calls: checks a real conflict triggers a follow-up
```

The orchestration here is **code-driven**: your program decides the rounds. In the Agent SDK you can make it
**model-driven** instead: a coordinator agent with the `Agent` tool and `agents` definitions (Part 5) decides when to
spawn. The decision rules are the same either way. When you're done, read `solution/WHY.md`.
