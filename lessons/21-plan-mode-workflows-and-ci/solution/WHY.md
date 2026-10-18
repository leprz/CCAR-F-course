# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Direct execution for T1, T2, T8 | "If you could describe the diff in one sentence, skip the plan." Plan mode adds overhead. | Over-planning a typo fix is a trap answer |
| Plan mode for T3, T4, T6 | Use it when the approach is unclear (OAuth, flaky test), several or unknown files change, risk is high, or a human must approve before edits (billing rounding). Plan mode reads and proposes, and edits stay blocked until the plan is approved. | "Needs approval before any change" / "unfamiliar code" → plan mode |
| Multi-phase for T5, T7 | Many repeated units (400 files) need a pilot, then batches with verification. Several stages that each need sign-off need explicit checkpoints. One giant plan + one giant execution can't be reviewed or resumed. | Large migrations → explore → pilot → batches → verify, with a progress file |
| `migrate-tests` skill: phases, "stop and wait for approval", `progress.md` | Human approval gates between phases, and an interrupted run resumes from the last batch. `disable-model-invocation` because it edits hundreds of files. | Multi-phase workflow with approval requirements |
| `permissions.defaultMode: "plan"` | Team policy for a high-risk repo: every session starts read-only. | Plan mode as a default, not just Shift+Tab |
| `-p` | Without it, `claude` starts an interactive session and the CI job hangs. | "CI job hangs" → missing `-p` |
| `--output-format json` (+ `--json-schema`) | Gives a single JSON object with `subtype`, `is_error`, `result`, `total_cost_usd`, `num_turns`, and `structured_output` when a schema is given. | Parse JSON, don't scrape text |
| `--permission-mode dontAsk` + exact `--allowedTools` | Unattended runs can't answer prompts: `dontAsk` denies anything not pre-approved. `--dangerously-skip-permissions` (`bypassPermissions`) is for isolated containers only. | Lock down CI; bypass is the tempting wrong answer |
| `Bash(git diff *)` instead of bare `Bash` | Scoped rule. The space before `*` matters: `Bash(git diff*)` would also match `git diff-index`. | Permission rule syntax |
| `--max-turns`, `--max-budget-usd` | Prevent runaway loops and spend. Exiting at the cap is an error result (`error_max_turns`, `error_max_budget_usd`), which CI must treat as failure. | O11: "cost and turn limits that prevent runaway executions" |
| `--no-session-persistence` | CI runners don't need resumable transcripts on disk. | Hygiene |
| Review job doesn't "fix" | A review step that edits code mixes responsibilities and needs write tools. Report, gate, let a human (or another job) fix. | Least privilege |

Also worth knowing:
- `--bare` skips CLAUDE.md, hooks, skills, agents, MCP and plugins for reproducible scripted runs. It's recommended for
  SDK and scripted calls and will become the `-p` default. Pass anything you still need explicitly with `--settings`,
  `--agents`, `--mcp-config` or `--append-system-prompt-file`. Without `--bare`, a `-p` run in a repo **does**
  run that repo's hooks and `.mcp.json` servers, with no trust dialog.
- `--permission-prompts none` tells an unattended run with a permission host to deny instead of waiting.
- `--tools` restricts which tools exist. `--allowedTools` pre-approves them.
