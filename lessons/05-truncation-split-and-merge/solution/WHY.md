# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Detect truncation through `stop_reason === "max_tokens"` | A truncated response may not match the schema, even with structured outputs | "JSON parse fails on long documents only" → truncation |
| Split into a header call + chunk calls, with bounded `max_tokens` | Each call's output is small and predictable, so it doesn't grow with document size | O28: "split into smaller scoped API calls and merge … rather than increasing max_tokens" |
| Header context repeated in every chunk | Each chunk call has the context it needs (vendor, columns) without the other lines | Scoped ≠ context-free |
| Chunk calls run concurrently | They're independent, so wall-clock time ≈ one chunk, not N | Latency follow-up questions |
| Truncated chunk → split in half and retry | Shrinks the problem to fit. A single line that still doesn't fit fails loudly | Distractor: "retry the same request" / "set max_tokens to the model maximum" |
| `line_no` in the schema, merge by `line_no` | Gives a stable key for ordering and de-duplicating overlapping or retried halves | Merging data structures |
| Reconcile the count and sum after merging | Catches silently dropped lines. Issues go to review instead of being accepted | Validation after merge |

When raising `max_tokens` *is* fine: a one-off response that's slightly over a small default (for example 1024 → 2048), where output size doesn't grow with input.
The docs suggest "raise max_tokens or continue" for that case. The exam objective is about tasks whose output grows with input. There, splitting is the answer.
