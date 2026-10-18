# L01 — Tool-use loop, `tool_choice`, dependent tool sequencing

**Objectives:** O27 (tool use + JSON schema, `tool_choice` to guarantee invocation), O37 (`tool_choice` + sequencing dependent tools)
**Scenario:** support desk (`fixtures/support/`)
**Read first:** [Part 1 lecture](../../teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md), sections 1–5 (*What is an agentic loop?* through *Tools that depend on each other*)

## Situation

A ticketing system triages inbound support tickets with Claude. It only reads a **structured** triage record:
the category and priority must be valid enum values, and every field must be present. Today the integration asks for
JSON in prose and runs `JSON.parse` on the reply. It breaks whenever the model adds a sentence before the JSON.
Investigating also needs data in a fixed order: `list_orders` needs the `customer_id` that only `lookup_customer` returns.

## Your task

Edit `starter/index.ts` until the tests pass. Work through the TODOs in order:

1. State the prerequisite in the dependent tool's description (`list_orders` → `lookup_customer`).
2. Make the `record_triage` schema enforce the contract: enums and required fields.
3. `toolChoiceFor`: force `lookup_customer` on turn 0, force `record_triage` when finalizing, and use `auto` otherwise.
4. `runToolCalls`: return one `tool_result` per `tool_use`, and turn failures and unknown tools into `is_error: true` with an instructive message.
5. `triageTicket`: build the real loop. Append the assistant turn verbatim, then the tool results. If the model ends its turn in prose, make a forced finalize call. Stop after `maxTurns`.

```bash
npx vitest lessons/01                      # your starter
SOLUTION=1 npx vitest run lessons/01       # reference solution
npm run test:live -- lessons/01            # real API (needs ANTHROPIC_API_KEY)
```

## Model caveat (current API)

Forced `tool_choice` (`any` / `tool`) returns **400** on Claude Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1. On those
models, use `auto` with `strict: true` tools or structured outputs instead. Haiku 5.5 (the live-test default) accepts forced
tool use. A forced call also skips thinking. The exam objective tests the classic pattern taught here. Know both.

When you're done, compare with `solution/` and read `solution/WHY.md`.
