# L17 — MCP resources vs tools, and tool descriptions that prevent misrouting

**Objectives:** O34 (expose server content as resources to cut exploratory tool calls), O36 (tool descriptions that separate similar tools)
**Scenario:** support desk (`fixtures/support/`) served through a `shop` MCP server; policy documents in `shop-data.ts`
**Read first:** [Part 7 lecture](../../teach-me/lectures/07-mcp/lecture.md), sections 1–3 (*What does an MCP server offer an agent?*, *When should content be a resource instead of a tool?*, *How does Claude choose between similar tools?*)

## Situation

The support agent spends its first 2–3 turns calling `list_policies` and then `get_policy` before it can answer anything.
The policies never change during a conversation, and the host app already knows which one a ticket needs. Meanwhile the
model mixes up `get_order`, `search_orders` and `search_customers`, because their descriptions are a few words each.

## Your task

Edit `starter/index.ts`:

1. Expose the policies as **resources**: an index at `shop://policies`, and a `shop://policies/{topic}` resource template
   whose `list` callback lists every policy.
2. Delete the exploratory `list_policies` and `get_policy` tools.
3. Rewrite the three remaining tool descriptions. Each one should state what it returns, its input format (with an example), when to use it, and which **sibling tool** to use instead.
4. `loadPolicyContext`: have the **host** read the resources (`readResource`) and wrap them for the prompt, so no tool call is spent.

The MCP server and client run in-process through `InMemoryTransport` (see `harness.ts`). This uses the same protocol messages
(`resources/list`, `resources/read`, `tools/list`, …) as stdio or HTTP.

```bash
npx vitest lessons/17
SOLUTION=1 npx vitest run lessons/17
npm run test:live -- lessons/17     # real model: checks each question goes to the right tool
```

Then read `solution/WHY.md`.
