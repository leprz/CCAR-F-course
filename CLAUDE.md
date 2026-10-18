# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A study repo for the **Claude Certified Architect – Foundations** exam. The learner failed a first attempt (481/720). The repo
pairs topic lectures with hands-on TypeScript lessons and quizzes, all mapped to 37 exam objectives (O01–O37).

- `plan.md`: decisions, the objective list with last scores, and the 8 parts / 22 lessons. **Read it before adding content.**
- `progress.md`: live status. **Update it whenever a step finishes**, so work can resume in a fresh session.
- `COVERAGE.md`: objective → doc → lesson → latest quiz score. The rows between the `coverage:start`/`coverage:end` markers
  are machine-edited by `scripts/coverage.ts`.

## Commands

```bash
npm test                                  # structural tests vs lessons/*/starter (expected to FAIL until the learner solves them)
npm run test:solution                     # same tests vs lessons/*/solution (must pass)
SOLUTION=1 npx vitest run lessons/02      # one lesson against its solution
npx vitest run lessons/01 -t "TODO\(3\)"  # a single test group (-t is a regex, escape the parens)
npm run test:live -- lessons/01           # real API; needs ANTHROPIC_API_KEY in .env; skipped without it
npm run typecheck                         # tsc --noEmit, strict; type-checks starters AND solutions
npm run gate [-- 01 02]                   # quality gate: starter must fail, solution must pass
                                          # (the learner edits starters in place: a solved lesson reports "starter passes"; that's expected, not a bug)
npm run coverage                          # merge ./progress.json (exported from the quiz portal) into COVERAGE.md
```

Quiz portal: invoke the project skill `/teach-me` (vendored in `.claude/skills/teach-me/`, always uses the `./teach-me/` root),
or run `bash .claude/skills/teach-me/scripts/serve.sh teach-me` and open `index.html` / `exam.html`.

## Lesson architecture

- `lessons/NN-slug/{starter,solution}/index.ts` export **identical signatures**. Tests import the active target with
  `loadLesson<typeof import('./solution/index.ts')>(import.meta.url)` (`lib/lesson.ts`, switched by `SOLUTION=1`), so `tsc`
  fails if a starter drifts from the solution.
- Starters compile but carry numbered `TODO(n)` bugs. Test `describe` blocks are named `TODO(n) ...` to match them.
- `lesson.test.ts` holds the structural tests and must run offline. LLM calls go through `MessageCreator` (`lib/claude.ts`), a
  narrow interface that the real SDK client and `FakeClient` (`lib/testing/`) both satisfy. `FakeClient` returns scripted
  `reply([...])` messages and records a deep copy of every request in `.calls`, so tests assert on what was *sent*.
- `lesson.live.test.ts` holds opt-in real-API tests. They use `describeLive` (skipped without a key) and `RecordingClient`. The model
  comes from `CLAUDE_MODEL`, defaulting to `claude-haiku-5-5` (cheap, and it still accepts forced `tool_choice`, which the
  Opus/Sonnet 5.5 models reject with a 400 error).
- Each lesson has a `README.md` (objectives, scenario, TODO list, lecture links) and `solution/WHY.md` (decision table
  with an "Exam signal" column).
- Claude Code configuration lessons (Part 8) will be sandbox folders with their own `.claude/`. Vitest excludes `**/sandbox/**`.
- Shared scenario data lives in `fixtures/<scenario>/` (currently `support/`). Backend errors are written as instructions for
  the model, because they end up in `is_error` tool results.

## Lectures and quizzes

- One lecture per part: `teach-me/lectures/NN-topic/lecture.md` (teach-me template: a book chapter with front-matter,
  one running example, numbered concept sections with "Check yourself" questions, summary, traps, going deeper) and `questions.json`.
- Lint a lecture with `python3 .claude/skills/teach-me/scripts/check-lecture.py teach-me/lectures/*/lecture.md` (must report no
  ERROR). To upgrade an old lecture, use `/teach-me --rewrite <slug>`.
- Every question carries `objectives: ["Oxx"]`. Validate with `python3 .claude/skills/teach-me/scripts/validate-quiz.py <file>`,
  then rebuild the index with `python3 .claude/skills/teach-me/scripts/build-library.py teach-me`.
- Write questions as exam-style scenarios with plausible distractors, and explain why each wrong option is wrong.

## Content rules

- **Facts come from the current official docs, not memory.** Fetch platform.claude.com / code.claude.com pages before writing
  a lecture. Put the links under *Going deeper* and update the "Sources checked" date. Where current API behaviour differs from
  the classic pattern the exam tests (for example forced `tool_choice` on 5.5 models), teach both and say which is which.
- SDK versions are pinned exactly in `package.json`. Use the SDK's real types so outdated field names fail `tsc`.
- A lesson is done only when `npm run gate -- NN` passes, `npm run typecheck` passes, the README/WHY/lecture/quiz exist, and
  `COVERAGE.md` and `progress.md` are updated. Run the live test when a key is available, and record it in `progress.md` if not.
- `package.json` is `"type": "module"`. The portal's `site/app.js` is a browser script, so node can't `require` it from inside the repo.
