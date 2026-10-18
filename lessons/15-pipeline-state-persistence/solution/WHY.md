# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| State in your own checkpoint file, not in the model session | Sessions persist the *conversation*, not your pipeline's progress or files. Anthropic's SDK docs suggest capturing results as application state and passing them to a fresh session, since that's often more robust than shipping transcripts around. | "Resume a multi-agent pipeline" → durable per-task state, not "resume the coordinator's session and ask it where it was" |
| One record per task: status, input hash, attempts, output, error | The record answers "is this done, and done for *this* input?" without asking a model. | "Without repeating completed work" → per-task status + idempotency key |
| Content hash of the task's input | Idempotency: same input → reuse the output. A changed input → rerun just that task, and downstream tasks rerun only if *their* inputs changed. | Changed-input questions: rerun only the affected tasks, not the whole pipeline |
| Canonical JSON (sorted keys) before hashing | Otherwise the same data re-read in a different key order looks "changed" and everything reruns. | Subtle: "pipeline re-processes everything after a restart even though nothing changed" |
| Checkpoint after **every** task (`running` before, `done` after) | A crash loses at most the task in flight. Saving once at the end loses everything. | Anthropic: resume from where the error occurred, because restarting from scratch is expensive |
| Atomic write (temp file + rename) | A crash *during* the write would otherwise leave a truncated checkpoint, which loses all prior findings. | "Without losing prior findings" |
| `running` at load → `pending` | The process died mid-task, so any partial output can't be trusted. Rerun just that task. | Recovery semantics |
| Ordinary failure → `failed` + error, and the run continues | One bad source shouldn't discard nine good ones. The report names the gap. | Error isolation in pipelines; report gaps, don't hide them |
| `maxAttempts` | Stops a permanently broken task from being retried (and paid for) on every run. | Bounded retries |

Related tools, so you can tell them apart:

- **Agent SDK `resume` / `forkSession`**: restore a *conversation*. Useful to continue one agent's reasoning, but
  not a substitute for pipeline state, and transcripts are local to the machine unless you use a `SessionStore`.
- **File checkpointing**: reverts *file edits* an agent made. That's a different problem.
- **Agent teams** (experimental): `/resume` doesn't restore in-process teammates. Another reason to keep the
  pipeline's state in your own store.
