# L19 — Choosing the configuration mechanism, and `context: fork`

**Objectives:** O16 (CLAUDE.md vs `.claude/rules/` globs vs skills vs hooks vs permissions), O14 (`context: fork` for skills and commands)
**Scenario:** Ledgerly (`fixtures/codebase/`), its Claude Code project config in `starter/sandbox/`
**Read first:** [Part 8 lecture](../../teach-me/lectures/08-claude-code-configuration/lecture.md), sections 1 (*Where should this instruction live?*) and 2 (*Running a skill in isolation with `context: fork`*)

## Situation

The Ledgerly team put everything they want Claude to know into one `CLAUDE.md`: repo-wide money rules, rules that only
apply to route files, rules for tests, a seven-step release procedure, and three "IMPORTANT: NEVER…" lines about `.env`
files, migrations and formatting. Claude follows most of it most of the time, which is the problem:

- the "NEVER read `.env`" line is advice, not a control
- prettier runs only when Claude remembers to run it
- the release procedure costs context in every session
- the `money-audit` skill floods the main conversation with every file it reads
- the `money-style` guideline skill is forked, so it runs in a subagent with no task and returns nothing useful

## Your task

1. `starter/index.ts`: `chooseMechanism(guidance)` maps each item in `scenarios.ts` to the right mechanism.
2. `starter/sandbox/CLAUDE.md`: keep only what every session needs, in 25 lines or fewer.
3. `starter/sandbox/.claude/rules/`: add path-scoped rules for `src/routes/**/*.ts` and `tests/**`.
4. `starter/sandbox/.claude/settings.json`: deny reading `.env` / `.env.*`, deny Edit and Write under `migrations/`,
   and add a `PostToolUse` hook on `Edit|Write` that runs prettier on the edited file.
5. Skills: fork `money-audit` into a read-only `Explore` subagent with a self-contained body. Make sure
   `money-style` is not forked.
6. Make `release` user-invoked only (`disable-model-invocation: true`).

```bash
npx vitest lessons/19
SOLUTION=1 npx vitest run lessons/19
npm run test:live -- lessons/19     # runs `claude -p` in a temp copy of Ledgerly + your sandbox (needs key + claude CLI)
```

The live test writes a canary `.env` and asks Claude to print it. Without a deny rule, `dontAsk` mode still lets Claude
read files in the working directory, so the starter leaks the canary and the solution doesn't.

> Nested `.claude/` folders inside this repo don't change *this* repo's Claude Code setup: settings, hooks and skills
> load from the session's project root. A nested `CLAUDE.md` or `.claude/rules/` file can load on demand when
> Claude reads files in that folder, though, so treat sandbox text as lesson data.

When you're done, read `solution/WHY.md`.
