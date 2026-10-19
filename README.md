# Claude Certified Architect – Foundations: practice repo

A study kit for the **Claude Certified Architect – Foundations** exam. It pairs a lecture for each topic with hands-on
TypeScript lessons and exam-style quizzes. Everything maps to the exam's 37 objectives (O01–O37), so you can see which
ones you've practised and how you scored on them.

- **8 lectures**: one book-style chapter per part, built from the current official docs.
- **22 lessons**: small TypeScript tasks with numbered `TODO(n)` bugs and tests that check your fix.
- **Quizzes and a mock exam** in a local web portal, with results broken down by objective and an *estimated* score
  out of 720.

## Setup

You need Node 22 or later.

```bash
npm install
cp .env.example .env    # only needed for live tests: set ANTHROPIC_API_KEY
```

The default tests run offline against a fake client, so you don't need an API key to work through the lessons.

## How to study

For each part, in order:

1. **Read the lecture** in the portal (see below). Each section ends with a *Check yourself* question.
2. **Do the lessons.** Open `lessons/NN-slug/README.md`, edit `starter/index.ts`, and work through the TODOs until the
   tests pass:
   ```bash
   npx vitest run lessons/01                  # one lesson
   npx vitest run lessons/01 -t "TODO\(3\)"   # one TODO group (-t is a regex)
   ```
   Stuck? `solution/index.ts` is the reference, and `solution/WHY.md` explains each decision and the exam signal behind it.
3. **Take the part's quiz**, then the **mock exam** once you've covered several parts. Results are broken down by
   objective, and *Export progress* downloads your latest result per objective as `progress.json`.

### The study portal

```bash
bash .claude/skills/teach-me/scripts/serve.sh teach-me    # prints the port, e.g. 8765
```

Open `http://localhost:<port>/index.html` for the library and `exam.html` for the mock exam. In Claude Code you can run
`/teach-me` instead. The server listens on localhost only.

In the lectures, fixture ids such as `INV-2` or `T-101` and paths such as `fixtures/support/` are links: they open the
sample document in a popup, so you can read the invoice or ticket the chapter is talking about.

## Parts and lessons

| Part | Topic | Lessons |
|------|-------|---------|
| 1 | Agentic loop & tool use | L01 tool loop, `tool_choice`, dependent tools · L02 parallel tool calls |
| 2 | Structured output & extraction | L03 output method + schema design · L04 accuracy, inclusion/exclusion criteria · L05 split and merge · L06 iterative refinement |
| 3 | Processing modes & review routing | L07 Messages vs Message Batches · L08 confidence-based human review |
| 4 | Context management | L09 context window optimisation · L10 cross-session context |
| 5 | Subagents (Agent SDK) | L11 agent definitions and tool scoping · L12 diagnosing broken subagent spawning · L13 delegation prompts and output schemas |
| 6 | Multi-agent orchestration | L14 orchestration patterns · L15 pipeline state persistence · L16 synthesis that keeps uncertainty |
| 7 | MCP | L17 resources vs tools · L18 server scope, auth, discovery |
| 8 | Claude Code configuration | L19 config mechanisms and `context: fork` · L20 review configs · L21 plan mode and CI · L22 exploration and test generation |

The objectives behind each lesson are listed in [`OBJECTIVES.md`](OBJECTIVES.md).

## Commands

| Command | What it does |
|---------|--------------|
| `npm test` | Structural tests against your starters. They fail until you fix the TODOs. |
| `npm run test:solution` | The same tests against the reference solutions (these must pass). |
| `npm run test:live -- lessons/01` | Real API calls. Needs `ANTHROPIC_API_KEY`; skipped without it. Uses `CLAUDE_MODEL` (default `claude-haiku-5-5`). |
| `npm run typecheck` | `tsc --noEmit` over starters and solutions. |
| `npm run gate [-- 01 02]` | Quality gate: each starter must fail and each solution must pass. Once you've solved a lesson it reports "starter passes", which is expected. |

## Layout

```
lessons/NN-slug/        README.md, starter/ (you edit this), solution/ (+ WHY.md),
                        lesson.test.ts (offline), lesson.live.test.ts (real API)
fixtures/               shared scenario data
  support/              customers, orders, tickets/T-*.txt, a fake backend
  invoices/             documents/INV-*.txt with ground-truth extractions
  research/             sources/S*.md for the research and synthesis lessons
  codebase/             a small buggy TypeScript API for the review lessons
teach-me/               the study portal: lectures/<part>/lecture.md + questions.json
lib/                    loadLesson, MessageCreator, FakeClient/RecordingClient for tests
scripts/                gate.ts (the quality gate)
.claude/skills/teach-me the teach-me skill that builds and serves the portal
OBJECTIVES.md           the 37 exam objectives and the lessons that cover them
CLAUDE.md               guidance for Claude Code when working on this repo
```

Lessons and solutions export the same signatures, and the tests load whichever one `SOLUTION=1` selects, so `tsc`
catches a starter that drifts from the solution. Claude Code lessons (Part 8) use sandbox folders with their own
`.claude/` configuration.
