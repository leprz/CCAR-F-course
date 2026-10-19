# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A study repo for the **Claude Certified Architect – Foundations** exam. The learner failed a first attempt (481/720). The repo
pairs topic lectures with hands-on TypeScript lessons and quizzes, all mapped to 37 exam objectives (O01–O37).

- `OBJECTIVES.md`: the 37 objectives and the 8 parts / 22 lessons they map to. **Read it before adding content.**
- All 22 lessons, 8 lectures and 8 quizzes are built. The build tracker (`plan.md`, `progress.md`) was retired on 2026-10-19;
  open items are under *Known gaps* below.

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
- The portal shows `fixtures/` through a gitignored symlink in `teach-me/` (made by `prepare-root.sh`) and `source.html`.
  `build-library.py` writes `sources.json`, mapping each fixture id to a file: a file whose name has a digit
  (`fixtures/invoices/documents/INV-1.txt` -> `INV-1`), else the `data.ts` with `id: '<ID>'`. In the notes, a click on an
  id or a `fixtures/…` path opens that file in a dialog, rendered by type (markdown, text, code, image, PDF). To make a new
  fixture viewable on its own, give it its own file named after its id (as the invoice documents are).

## Content rules

- **Facts come from the current official docs, not memory.** Fetch platform.claude.com / code.claude.com pages before writing
  a lecture. Put the links under *Going deeper* and update the "Sources checked" date. Where current API behaviour differs from
  the classic pattern the exam tests (for example forced `tool_choice` on 5.5 models), teach both and say which is which.
- SDK versions are pinned exactly in `package.json`. Use the SDK's real types so outdated field names fail `tsc`.
- A lesson is done only when `npm run gate -- NN` passes, `npm run typecheck` passes, the README/WHY/lecture/quiz exist, and
  *Known gaps* is updated. Run the live test when a key is available, and record it under *Known gaps* if not.
- `package.json` is `"type": "module"`. The portal's `site/app.js` is a browser script, so node can't `require` it from inside the repo.

## Known gaps

- No live test has run yet (no `ANTHROPIC_API_KEY` on this machine). L01, L14, L15 and L20 force `tool_choice`, so they need
  Haiku 5.5, not Opus/Sonnet 5.5. The L02 live test asserts `avgPerMessage > 1`; loosen it if Haiku doesn't batch reliably.
  Part 8 live tests run `claude -p` in temp copies of the sandboxes.
- Unverified: Part 7's claims about token rotation and remote `url`/`headers` reading some keys as empty; Part 5's example
  `Agent` tool_use input including `description`; the Part 8 prettier hook and `` ```! `` skill blocks (never executed);
  Mermaid diagrams in the portal.
- The portal was tested with jsdom, not a real browser. Check `exam.html` styling and the progress download in Chrome.
- Quiz scores live in browser localStorage per portal port. Export progress before the port changes.
- Nested `CLAUDE.md` / `.claude/` files under `lessons/19-22/*/sandbox/` can load on demand when Claude Code reads files
  there. Harmless, but expected.
