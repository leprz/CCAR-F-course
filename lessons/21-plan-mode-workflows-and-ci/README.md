# L21 — Plan mode vs direct execution vs multi-phase, and Claude Code in CI

**Objectives:** O08 (choose plan mode, direct execution or a multi-phase workflow by scope, risk and approval needs), O11 (CLI in CI: non-interactive flags, permission modes, turn and cost limits)
**Scenario:** Ledgerly change requests (`tasks.ts`) and its PR-review workflow (`starter/sandbox/.github/workflows/`)
**Read first:** [Part 8 lecture](../../teach-me/lectures/08-claude-code-configuration/lecture.md), sections 4 (*Plan mode, direct execution, or a multi-phase workflow?*) and 5 (*Running Claude Code unattended in CI*)

## Situation

The team runs every task the same way: they type it in and let Claude go. Typos and 400-file migrations, billing
changes the lead wanted to see first. CI is worse. The review workflow calls `claude "Review this PR and fix any
problems" --dangerously-skip-permissions`. With no `-p`, the run waits for interactive input. It has no turn or budget
cap and every permission check is bypassed. It is also asked to *fix* things in a review job.

## Your task

1. `chooseApproach(task)`: `direct`, `plan-mode` or `multi-phase` for each task in `tasks.ts`.
2. `buildCiArgs(job)`: `-p`, `--output-format json`, `--permission-mode dontAsk`, the job's `--allowedTools`,
   `--max-turns`, `--max-budget-usd`, `--no-session-persistence`, and `--json-schema` / `--model` when given.
3. `interpretResult(result)`: pass only `subtype: "success"`. Hitting `--max-turns` or the budget fails the step.
4. Sandbox workflow: rewrite the `claude` step to match, allow only read tools plus `Bash(git diff *)`, ask for review
   only, and gate the job on the JSON result with `jq -e`.
5. Sandbox config: start sessions in plan mode for this billing repo (`permissions.defaultMode`). Turn the
   `migrate-tests` skill into phases with approval checkpoints and a progress file.

```bash
npx vitest lessons/21
SOLUTION=1 npx vitest run lessons/21
npm run test:live -- lessons/21    # runs your buildCiArgs against a temp copy of Ledgerly
```

`--max-turns` exists but isn't listed in `claude --help`. The CLI reference says the help output doesn't list every flag.

When you're done, read `solution/WHY.md`.
