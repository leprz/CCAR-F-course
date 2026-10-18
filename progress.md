# Progress

The plan and decisions are in `plan.md`. Update this file whenever a step finishes or a decision changes.

## Current phase

**Phase 4 done: all 22 lessons and 8 lectures are built** (2026-10-18). Everything is in place except the Part 8 quiz (see *Open items*).
Next: the learner works through the lessons in order; live tests run once there's an API key.

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
- [x] Phase 3: user review. The user worked L01/L02 and asked to continue without format changes
- [x] Phase 4: Parts 2–8 (added deps: `zod` 4.6.7, `@modelcontextprotocol/sdk` 1.32.1, both Agent SDK peers)

## Lesson status

| Lesson | Lecture | Starter | Solution | Gate | Live test | Quiz |
|--------|---------|---------|----------|------|-----------|------|
| L01 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L02 | ✅ | ✅ (solved by learner) | ✅ | ✅ | ⚠️ not run | ✅ |
| L03 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L04 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L05 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L06 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L07 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L08 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L09 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L10 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L11 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L12 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L13 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L14 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L15 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L16 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L17 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L18 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ✅ |
| L19 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ❌ Part 8 quiz missing |
| L20 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ❌ Part 8 quiz missing |
| L21 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ❌ Part 8 quiz missing |
| L22 | ✅ | ✅ | ✅ | ✅ | ⚠️ not run | ❌ Part 8 quiz missing |

## Format changes after review

**2026-10-18: lectures become book chapters.** The user found the cheat-sheet lectures hard to learn from. Decisions (grill):
chapter length sized to the subject (~4–6k words for a broad part, shorter for narrow topics), one running scenario through the
whole chapter, book structure (opening → running example → numbered concept sections, each with problem/idea/worked example/
what goes wrong/Check yourself → putting it together → summary → traps table → going deeper). The skill's `lecture-template.md`
and SKILL.md §4 were rewritten (`depth: chapter|deep|brief`, new `--brief` flag). **Part 1 is rewritten**; the quiz was kept
(its facts are unchanged). **Next: user reviews Part 1; if approved, rewrite Parts 2, 4, 5, 7 the same way** (and update
the lesson READMEs' "Read first" section names, as was done for L01/L02).

Earlier: none requested. The user solved L02 directly. The one stumble was leaving the old sequential loop in place next to the new concurrent code, which the tests caught.

## Open items

- **Part 8 quiz (`teach-me/lectures/08-claude-code-configuration/questions.json`) isn't written yet.** The Part 8 agent said the user asked it to skip the teach-me work, which still needs confirming with the user. Target: about 16 questions over O08, O11, O13, O14, O15, O16, O17, O24, O30 and O32, with the anti-giveaway rules.
- No live tests have run for any lesson (no API key). Several (L01, L14, L15, L20) force `tool_choice`, so they need Haiku 5.5 or another model that accepts it, not Opus/Sonnet 5.5. The Part 8 live tests run `claude -p` in temp copies of the sandboxes.
- Unverified details flagged by the agents: Part 7 has three small claims of its own (token rotation, why remote `url`/`headers` read some keys as empty), Part 5's example `Agent` tool_use input includes `description`, the Part 8 prettier hook and `` ```! `` skill blocks have never executed, and Mermaid diagrams haven't been checked in the portal.
- Nested sandbox `CLAUDE.md` / `.claude/` files under `lessons/19-22/*/sandbox/` can load on demand when Claude Code reads files there. That's harmless, but expected.

- Live tests for L01/L02 have never run: there's no `ANTHROPIC_API_KEY` on this machine yet. Once a key is in `.env`, run `npm run test:live` and record the result.
  The L02 live test asserts `avgPerMessage > 1`. If Haiku doesn't batch reliably, loosen it or strengthen the prompt.
- The portal pages were tested with jsdom against the local server, not in a real browser. Check `exam.html` styling and the progress download in Chrome.
- Quiz scores live in browser localStorage per portal port. Export progress before the port changes.
- Learned during research: forced `tool_choice` (`any`/`tool`) returns 400 on Opus 5.5 / Sonnet 5.5 / Fable 5.1 / Mythos 5.1. Lectures teach both the classic exam pattern and this caveat.
