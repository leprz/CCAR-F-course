# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Decide on **blocking** and **acceptable wait**, not volume | A batch only promises results within **24 hours**, although most finish within an hour. Anything a user, a CI job or the next pipeline step is waiting on must be synchronous, however many requests it has. | "Pre-merge check on 300 files → batch to save 50%" is the trap; a blocking workflow means the Messages API |
| Non-blocking work that can wait ≥ 24h → batch | 50% off input and output tokens, it doesn't count against Messages API rate limits, and up to 100,000 requests or 256 MB per batch | Nightly re-triage, weekly evals and bulk backfills are batch work, even when there are only a few requests |
| Client-tool loops → sync | Each request in a batch is a single Messages call. If it stops with `tool_use`, your tool result needs a *new* request: another batch round of up to 24h. Server tools (web search and similar) do run inside a batch. | "Agent that calls our internal API per ticket, run as a batch" won't finish in time |
| `custom_id` = document id, sanitized, unique | It must match `^[a-zA-Z0-9_-]{1,64}$` and be unique in the batch. It's the **only** link between a result and its input. | Matching results by array position is the bug |
| Same `params` as the sync request | A batch request is a normal Messages request plus `custom_id`. Try the shape synchronously before batching thousands. `stream`, `speed` and `max_tokens: 0` aren't allowed. | Batch supports tools, vision, system prompts, multi-turn and structured outputs |
| Poll `retrieve` until `processing_status === "ended"` | The statuses are `in_progress`, `canceling` and `ended`. `request_counts` other than `processing` stay 0 until the whole batch ends. You can only read results after it ends (or expires at 24h). | Reading results while `in_progress` |
| Results keyed by `custom_id` | The `.jsonl` results are **not** in request order | Order assumptions |
| `expired` / `canceled` → retry. Transient `errored` → retry. `invalid_request_error` → fix | Expired and canceled requests never reached the model and aren't billed. An invalid request will fail again, so it needs a code fix. | "Resubmit the whole batch" wastes money. "Ignore errors" loses data. |
| Retry only the failures, as a smaller batch | Retrying everything pays twice for the successes | Retry strategy questions |
| Truncated (`max_tokens`) success → non-retryable failure | The output may be incomplete JSON. Resubmitting the same request gives the same truncation, so fix `max_tokens` or split the task (L05). | Treating every `succeeded` result as usable |

Other facts worth knowing:
- Results stay downloadable for **29 days** after batch creation.
- Prompt caching works in batches (best effort, with typical hit rates of 30–98%), and its discount stacks with the batch discount. Put identical `cache_control` blocks in every request.
- A batch can't be edited after submission; cancel it and resubmit. A canceled batch ends as `ended` and may contain partial results.
