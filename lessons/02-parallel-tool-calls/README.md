# L02 — Parallel tool calls in one turn

**Objective:** O01 (multiple tool calls in a single response turn, run in parallel to cut round trips)
**Scenario:** support desk, ticket `T-101` ("status of A1001, A1002 and A1003?")
**Read first:** [Part 1 lecture](../../teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md), section *Parallel tool calls*

## Situation

The order-status bot needs three round trips to answer a question about three orders: one `get_order` per turn, each run
one after another. The lookups are independent and read-only, so they could all happen in **one** assistant turn and run
concurrently. Several things in the current code stop that from happening.

## Your task

Fix `starter/index.ts`:

1. `SYSTEM_PROMPT`: invite simultaneous calls for independent operations, and say that only independent calls should be batched.
2. `buildRequest`: find the request setting that caps each turn at one tool call.
3. `executeTurn`: run the turn's calls concurrently. Keep the results in `tool_use` order, and make sure one failure doesn't drop the others.
4. `appendToolResults`: return the assistant turn followed by **one** user message containing every `tool_result`.
5. `parallelismStats`: compute the average number of tool calls per tool-calling response, so you can measure parallelism.

```bash
npx vitest lessons/02
SOLUTION=1 npx vitest run lessons/02
npm run test:live -- lessons/02     # checks avgPerMessage > 1 against the real model
```

When you're done, read `solution/WHY.md`.
