# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| **Scratchpad file** with findings **and content hashes** | Findings alone can't tell you which ones are still valid. With hashes, the next session knows exactly what changed. | "Agent restarts and redoes all work" → persist progress in a file, not only in conversation history |
| **Content hashes**, not file names or mtimes | An edit keeps the path, and a checkout changes mtimes without changing content. | "Targeted re-analysis of changed files" (O02) |
| Re-analyze **changed + added** only; **carry** unchanged findings; **re-verify** old findings on changed files | No repeated work, no stale findings. Old findings are injected so the analyzer can confirm or drop them. | "Restore state accurately without repeating prior work" |
| **Atomic save** (temp file + `rename`) | An interrupted run can't leave a half-written scratchpad that breaks the next resume. | State-persistence reliability (also O09 in Part 6) |
| Missing file → `null`; corrupt file → **throw** | "No previous session" is normal. Silently starting over on corruption would hide data loss. | Failure-mode questions |
| **One isolated context per file**, only structured findings returned | File contents never pile up in the coordinator's context. This is what a subagent gives you (fresh context window, summary back). | O20: subagent isolation instead of one giant conversation |
| Conventions in the **system prompt** of each isolated call | Every isolated reviewer applies the same standards, because it can't see the coordinator's history. | Subagents don't inherit context: pass what they need explicitly (see Part 5, O03) |
| **Briefing** instead of replaying the old transcript | Injecting a compact state block is cheaper and more accurate than resuming a huge, partly stale history. | "Context injection" vs "resume the full session" trade-off |
| Agent SDK `resume` vs `resume` + `forkSession` | `resume` appends to the same session id; `forkSession: true` copies the history to a new id and leaves the original unchanged. | Claude Code equivalent: `claude --continue` / `--resume` vs `--fork-session` (`/branch`) |

When is resuming the full session better than a briefing? When the session is short, recent, and the files haven't
changed, the exact transcript (including tool results) is still accurate. When files changed since the session ended,
an old transcript holds **stale** tool results, so prefer a fresh session with injected state plus targeted re-reads.
