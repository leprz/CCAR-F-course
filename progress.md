# Progress

The plan and decisions are in `plan.md`. Update this file whenever a step finishes or a decision changes.

## Current phase

**Phase 3: waiting for the user to review the Part 1 slice** (2026-10-18). Don't start Parts 2–8 until the review
feedback is recorded under *Format changes after review*.

## Phases

- [x] Phase 0: grill-me planning, `plan.md`
- [x] Phase 1: scaffold
  - [x] package.json (exact pins: `@anthropic-ai/sdk` 0.135.0, `@anthropic-ai/claude-agent-sdk` 0.3.302, vitest 5.0.5, tsx 4.23.15, typescript 7.0.2), tsconfig, vitest configs (structural + live), `.env.example`
  - [x] `lib/`: `loadLesson` (`SOLUTION=1` switch), `MessageCreator`, `FakeClient`/`RecordingClient`/`describeLive`
  - [x] `scripts/gate.ts` (`npm run gate`)
  - [x] `COVERAGE.md` with O01–O37
  - [x] teach-me vendored into `.claude/skills/teach-me/` with extensions 1–5 (objectives field, per-objective results, `exam.html`, Export progress, slugs without dates)
  - [x] `scripts/coverage.ts` (`npm run coverage`)
  - [x] Project `CLAUDE.md`
- [x] Phase 2: Part 1 vertical slice
  - [x] `fixtures/support/` (customers, orders, tickets, fake backend)
  - [x] L01 tool loop + `tool_choice` + sequencing (O27, O37)
  - [x] L02 parallel tool calls (O01)
  - [x] Lecture `teach-me/lectures/01-agentic-loop-and-tool-use/` (researched 2026-10-18) + 10-question quiz
- [ ] Phase 3: **user review of the slice**, then adjust the format here
- [ ] Phase 4: Parts 2–8

## Lesson status

| Lesson | Lecture | Starter | Solution | Gate | Live test | Quiz |
|--------|---------|---------|----------|------|-----------|------|
| L01 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run (no API key) | ✅ |
| L02 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run (no API key) | ✅ |
| L03–L22 | – | – | – | – | – | – |

## Format changes after review

(none yet)

## Open items

- Live tests for L01/L02 have never run: there's no `ANTHROPIC_API_KEY` on this machine yet. Once a key is in `.env`, run `npm run test:live` and record the result.
  The L02 live test asserts `avgPerMessage > 1`. If Haiku doesn't batch reliably, loosen it or strengthen the prompt.
- The portal pages were tested with jsdom against the local server, not in a real browser. Check `exam.html` styling and the progress download in Chrome.
- Quiz scores live in browser localStorage per portal port. Export progress before the port changes.
- Learned during research: forced `tool_choice` (`any`/`tool`) returns 400 on Opus 5.5 / Sonnet 5.5 / Fable 5.1 / Mythos 5.1. Lectures teach both the classic exam pattern and this caveat.
