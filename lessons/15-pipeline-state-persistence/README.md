# L15 — Pipeline state persistence and resumption

**Objective:** O09 (state persistence for multi-agent pipelines: resume after interruption without repeating finished work or losing findings)
**Scenario:** research team, `fixtures/research/`
**Read first:** [Part 6 lecture](../../teach-me/lectures/06-multi-agent-orchestration/lecture.md), section 4, *Surviving a crash: state that outlives the process*

## Situation

The evidence pipeline has three stages:

```
collect:S1 … collect:S10   (one model call per source: extract findings)
analyze:<claim>            (one per claim: classify the evidence)
report                     (one: write the brief)
```

Last night it ran for 40 minutes, the container was recycled at `collect:S7`, and the morning run started from
`collect:S1` again, paying for every model call twice. When a single PDF failed to parse, the whole run threw away
nine sources' worth of findings. The state file it does write is written once, at the very end, straight over the
old one.

## Your task

Edit `starter/index.ts`:

1. `hashInput`: the same content gives the same hash, whatever the key order.
2. `StateStore.save`: atomic. Write a temp file in the same directory, then rename it over the checkpoint.
3. `recoverState`: interrupted (`running`) tasks run again, failed ones retry until `maxAttempts`, and finished ones are kept.
4. `runPipeline` → `step`: skip a `done` task whose input hash is unchanged, and checkpoint per task (`running` before,
   `done` + output after).
5. `step`: an ordinary failure is recorded and the run continues. A `CrashError` still propagates, and tasks out of attempts aren't retried.

Notice what you get for free from content hashing: the analysis tasks hash **their inputs** (the collected findings),
so editing one source re-runs only that source and the claims it touches. If those analyses come out identical, the
report is reused too.

```bash
npx vitest lessons/15
SOLUTION=1 npx vitest run lessons/15
npm run test:live -- lessons/15    # real extraction calls, a simulated crash, then a resume that skips paid work
```

When you're done, read `solution/WHY.md`.
