# L09 — Context window optimization

**Objective:** O21 (summarization, sliding windows, structured state objects, selective retention)
**Scenario:** support desk, a long conversation about ticket `T-100` (`conversation.ts`)
**Read first:** [Part 4 lecture](../../teach-me/lectures/04-context-management/lecture.md), sections 1–3 (*What fills the context window, and why does a fuller window hurt?* through *Which facts must never be paraphrased?*)

## Situation

A support chat runs for dozens of turns. The early turns hold what matters: customer `cus_002`, order `B2001`, a duplicate
charge of exactly `$899.99`, refund case `RF-7731`, and a **promise** to refund within 5 business days. The later turns are
newsletter small talk. When the conversation gets too long, the current code keeps only the last few messages, so the
agent forgets the amount and the promise. Sometimes it also cuts between a `tool_use` and its `tool_result`, which the
API rejects.

Your job is to keep the context under a token budget **without losing the facts**:

```mermaid
flowchart LR
  H[full history] -->|count tokens| B{over budget?}
  B -- no --> S[send as-is + state]
  B -- yes --> W[sliding window: older | recent]
  W --> X[extract facts from older -> merge into state]
  W --> Y[summarize older]
  X --> C[system: base + case_state JSON]
  Y --> M[first recent user msg: summary + text]
  W --> R[recent turns verbatim]
```

## Your task

Fix `starter/index.ts`, TODO by TODO:

1. `apiTokenCounter`: use `client.messages.countTokens` for the target model instead of characters ÷ 4.
2. `slidingWindow`: cut only at *human* turns, so no `tool_use`/`tool_result` pair is split and `recent` starts with a user message.
3. `mergeState`: selective retention. Ids and commitments accumulate, newer exact facts override older ones, and `open_issues` takes the latest value.
4. (a) `SUMMARY_SYSTEM` must demand exact ids, amounts, dates and commitments. (b) `extractFacts` must *force* `record_case_facts`.
5. `buildContext`: put the state JSON in the system prompt and the summary block before the verbatim recent turns.
6. `manageContext`: leave the history alone when it's under budget; otherwise window, extract, merge, summarize and build, then check the budget again.

```bash
npx vitest lessons/09
SOLUTION=1 npx vitest run lessons/09
npm run test:live -- lessons/09      # compacts the real conversation, then asks Claude the key question
```

When you're done, read `solution/WHY.md`.
