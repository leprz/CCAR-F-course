# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| No `disable_parallel_tool_use` | Parallel calls are **on by default**. The flag sits *inside* `tool_choice`, not at the top level. With `auto` it means "at most one tool"; with `any`/`tool` it means "exactly one". | A question with a sequential agent and an unexplained high round-trip count → look for this flag |
| System prompt: "invoke all relevant tools simultaneously… only batch independent calls" | Recommended prompting from the parallel tool use docs. The second sentence keeps dependent calls out of a batch. | "Configure agentic loops to emit multiple tool calls within a single turn" |
| All `tool_result`s in **one** user message | Separate user messages per result is the #1 cause the docs list for Claude *stopping* parallel calls: the history teaches it to call one at a time. | Most likely trap: "send each result as soon as it's ready in its own message" |
| `tool_result` blocks first, text after | Text before a `tool_result` in that message returns a 400. | Formatting-rule distractors |
| `Promise.allSettled`, not a sequential loop | Parallel *emission* only saves latency if you also *execute* in parallel. `allSettled` keeps one failure from dropping the others. | Latency questions: "fewer round trips **and** concurrent execution" |
| Failed call → `is_error: true` result, not missing | Every `tool_use` needs a matching result, even if you didn't run it. | Missing-result 400 errors |
| `parallelismStats` > 1.0 | The docs' way to check that parallel calls actually happen. | Verification / monitoring questions |

When **not** to run calls in parallel: tools with side effects, shared state or ordering requirements. Run those
sequentially, stop at the first failure, and return `is_error: true` for every call you skipped.
