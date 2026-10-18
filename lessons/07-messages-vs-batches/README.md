# L07 — Messages API or Message Batches API?

**Objective:** O23 (choose synchronous Messages or asynchronous Message Batches by latency requirement, blocking behaviour and acceptable processing window)
**Scenario:** accounts-payable inbox (`fixtures/invoices/`), plus the support desk's ticket workloads
**Read first:** [Part 3 lecture](../../teach-me/lectures/03-processing-modes-and-review-routing/lecture.md), sections 1–3 (*1. What is the Message Batches API, and what does it trade away?*, *2. When should a workload use a batch?*, *3. How do you get batch results back reliably?*)

## Situation

Northwind's finance team wants every invoice in the inbox extracted overnight, using the extraction request from Part 2.
The first implementation has these problems:

- It chooses between the Messages API and the Batches API by **volume** ("over 100 requests → batch"), so a 300-file
  pre-merge CI review got batched and a developer waited hours for it.
- Its `custom_id`s contain `/`, so the batch is rejected.
- It reads the batch status once and assumes the batch is done.
- It assumes results come back in request order.
- It drops every failure silently, and when it does retry, it resubmits the whole batch.

## Your task

Edit `starter/index.ts`:

1. `chooseProcessingMode`: decide by blocking, acceptable wait (versus the 24h batch window) and client-tool loops, not by volume.
2. `toCustomId` + `buildBatchRequests`: ids that match `^[a-zA-Z0-9_-]{1,64}$`, taken from the document id, unique (throw on duplicates).
   `params` must be exactly the synchronous request.
3. `waitForBatch`: poll `retrieve` until `processing_status === "ended"`, sleeping between polls, with a timeout.
4. `collectResults`: key results by `custom_id`, since order isn't guaranteed. Classify `errored` / `canceled` / `expired`,
   and decide which failures are retryable.
5. `retryRequests`: resubmit only the retryable failures.
6. `runBatchExtraction`: one retry round by default.

`batches-client.ts` defines the narrow `BatchesClient` interface (the real SDK client satisfies it) and the `FakeBatches`
test double.

```bash
npx vitest lessons/07
SOLUTION=1 npx vitest run lessons/07
npm run test:live -- lessons/07     # a real 2-request batch; waits up to 20 min, then cancels and skips
```

When you're done, read `solution/WHY.md`.
