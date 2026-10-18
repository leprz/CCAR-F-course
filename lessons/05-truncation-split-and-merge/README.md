# L05 — Truncation: split into scoped calls and merge

**Objective:** O28 (resolve structured output truncation by splitting large tasks into smaller scoped calls and merging, rather than raising `max_tokens` beyond practical limits)
**Scenario:** the 60-line Globex invoice (`largeInvoice` in `fixtures/invoices/`)
**Read first:** [Part 2 lecture](../../teach-me/lectures/02-structured-output-and-extraction/lecture.md), section 5, *What do you do when the answer doesn't fit?*

## Situation

The extractor sends the whole 60-line invoice in one call. The response stops with `stop_reason: "max_tokens"` halfway through the
`line_items` array. That JSON is incomplete, and the structured-outputs guarantee no longer applies. The current "fix" retries
with `max_tokens: 64000`. That's slow, expensive, can exceed what the model or SDK handles without streaming, and breaks again on the
next 200-line invoice.

## Your task

Edit `starter/index.ts`:

1. `splitDocument` / `chunkLines`: separate the header, item lines and footer, and chunk the item lines.
2. `buildChunkRequest`: one *scoped* call per chunk, containing the header for context plus only that chunk, with a bounded `max_tokens`.
3. `mergeLineItems`: order by `line_no` and remove overlaps.
4. `extractLargeInvoice`: run the header call and all chunk calls concurrently. A chunk that truncates gets **split in half** and both halves retried.
   Afterwards, reconcile the merged result against the printed line count and total.

```bash
npx vitest lessons/05
SOLUTION=1 npx vitest run lessons/05
npm run test:live -- lessons/05
```
