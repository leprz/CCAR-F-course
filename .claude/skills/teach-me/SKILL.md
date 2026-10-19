---
name: teach-me
description: Turn any topic — or the thing Claude just recommended — into a saved markdown lecture plus an interactive quiz served from a local web portal. USE WHEN the user wants to learn/understand a concept more deeply, says "teach me X", triggers learning about a recommendation just made, points at a file to learn about it, or wants to review/retake a past lecture. In this repo (CCA-F exam prep) it also runs the objective-tagged quizzes, the mock exam page, and progress export.
user-invocable: true
argument-hint: '[topic | @file | @slug] [--deep|--brief] [--here|--global] [--list] [--open <slug>] [--requiz <slug>] [--rewrite <slug>] [--notes-only] [--stop]'
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
---

# teach-me

Create a book-style lecture (a chapter with a running example) on a topic, generate a quiz from it, and open a local
web portal to study. Lectures are saved as markdown so they can be revisited;
quizzes are JSON loaded over HTTP (never embedded in HTML).

> **Vendored copy — claude-CCAR-F-practice.** This is a project skill copied from
> the global `~/.claude/skills/teach-me/` and extended for exam prep (see
> **§11 Exam-prep extensions**). Never edit the global copy from this repo.

This skill's own assets live in its folder (referred to below as `$SKILL`):
`<repo>/.claude/skills/teach-me/`.

**Library root in this repo: always the project-local root `<repo>/teach-me/`**
(the repo root's `teach-me/` folder). Do not ask where to save, and ignore
`--global`; `--here` is implied. The global root (`~/.claude/teach-me/`) is only
touched by `--stop` when its server is running.

The root is self-contained: it holds the static site files (`index.html`,
`quiz.html`, `notes.html`, `exam.html`, `app.js`, styles and vendored libs),
`library.json`, and a `lectures/` folder, and is served by its own background
HTTP server. In this repo everything in the root is committed except
`.server.pid` / `.server.port`.

### Helper scripts

`$SKILL/scripts/` holds six deterministic helpers — prefer them over doing the
mechanics by hand. They find `$SKILL` from their own location, so just call them:

| Script | Does | Used by |
| --- | --- | --- |
| `prepare-root.sh <root> [slug]` | make dirs, version-sync assets, write `.gitignore` (ignores only `.server.pid`/`.server.port`) | §3 |
| `check-lecture.py <lecture.md>…` | lint a lecture against the book-chapter contract (structure, Check yourself answers, length band, cheat-sheet relapse) | §4, §9b |
| `validate-quiz.py <questions.json>` | validate a quiz against the schema (jsonschema, structural fallback) | §5 |
| `build-library.py <root>` | rebuild `<root>/library.json` from all lectures | §5b, §8 |
| `serve.sh <root>` | start/reuse the background server, print the port | §6 |
| `stop.sh <root> [<root>…]` | kill recorded server(s), clear pid/port files | §10 |

---

## 1. Parse the arguments

From `$ARGUMENTS`, detect (in this order):

- `--stop` → go to **§10 Stop** and do nothing else.
- `--list` → go to **§8 List**.
- `--open <slug>` or a bare leading-`@` token that did **not** expand to file
  contents (e.g. `@infer-in-typescript`) → go to **§7 Reopen** with that slug.
- `--requiz <slug>` → go to **§9 Requiz**.
- `--rewrite <slug>` → go to **§9b Rewrite** (upgrade an existing lecture in place).
- Otherwise this is a **create** (§2–§5). Note these create-flags:
  - `--deep` → textbook depth; `--brief` → short refresher; else a full chapter
    sized to the subject (§4).
  - `--notes-only` → write the lecture only; skip quiz, manifest-quiz fields, and server.
  - `--here` / `--global` → accepted for compatibility; in this repo the root
    is always `<repo>/teach-me/` (§3).

A `@file` that **did** expand to inlined file contents is a topic source: treat
the file's contents as the subject of the lecture (see §2).

## 2. Resolve the topic

- If an explicit topic string was given → use it. No confirmation.
- If a `@file`'s contents were inlined → the topic is "understanding this file";
  use its contents as primary source. No confirmation.
- If **no** topic was given → infer the subject from the most recent
  recommendation, decision, or concept discussed in the conversation. **Always
  confirm before generating**: state the topic and angle you inferred and ask the
  user to confirm or correct it (one short question). Do not proceed until
  confirmed.

Derive a `topic-slug` (lowercase, hyphenated). Slugs only have to match
`^[a-z0-9]+(?:-[a-z0-9]+)*$`; the date prefix is **optional**:

- **Topic lectures for the plan's parts** (the normal case in this repo):
  `slug` = `<NN>-<topic-slug>` with the two-digit part number, e.g.
  `01-agentic-loop-and-tool-use`. The library lists these first, in part order.
- **Ad-hoc lectures** (anything not tied to a part): `slug` =
  `<YYYY-MM-DD>-<topic-slug>` using today's date, listed after the topic
  lectures, newest first.

If that folder already exists, append `-2`, `-3`, … Never overwrite an existing
lecture (a topic lecture is updated in place only when the user asks for it).

## 3. Resolve and prepare the root

1. **The root is `<repo>/teach-me/`.** No prompt (see the note at the top).
2. **Prepare it in one shot:** `bash $SKILL/scripts/prepare-root.sh <root> <slug>`.
   This creates `<root>/lectures/<slug>/`, version-syncs the site assets when the
   skill is newer (copying every file in `$SKILL/site/`, never touching
   `library.json` or `lectures/`), and writes a `.gitignore` that ignores only
   the server's `.server.pid` / `.server.port` (site assets, `library.json` and
   lectures are committed so the repo is self-contained). It prints
   `synced <ver>` or `up-to-date <ver>`. When you change anything in
   `$SKILL/site/`, bump `$SKILL/site/VERSION` so roots re-sync.

## 4. Write the lecture

Read `$SKILL/lecture-template.md` and fill it in for the topic. Replace every
placeholder and strip all HTML comments. Fill the YAML front-matter
(`title`, `topic`, `date`, `depth`, `tags`). Save to
`<root>/lectures/<slug>/lecture.md`.

**Write a book chapter, not a cheat sheet.** The reader should be able to learn
the topic from the lecture alone, the way they would from a good technical book:

- **Explain before you list.** Full paragraphs that say *why* something exists
  and *what problem it solves* before naming the API or rule. Bullets are only
  for real lists (options, steps, checklists) and the end-of-chapter summary.
- **One running example.** Pick a single realistic scenario (in this repo, reuse
  the matching `fixtures/<scenario>/` data and the lesson's code) and grow it
  through every section, so each new concept is shown changing something the
  reader already understands.
- **Show the real thing.** Concrete requests, responses, payloads and code that
  the reader can trace by hand, followed by a walkthrough of what to notice.
- **Show failure, not just success.** For each concept, show the common mistake
  (the broken payload or code and its symptom) and then the fix.
- **Define every term** the first time it appears; never assume the vocabulary.
  Spell out abbreviations and internal shorthand (write "Lesson 3", not "L03";
  "purchase order number", not just "PO"), or gloss them once in parentheses at
  the first mention. Keep that gloss to a few words.
- **Check yourself** at the end of each concept section: one scenario question
  with a collapsible answer that explains the reasoning.

**Length follows the subject.** Default (`depth: chapter`): as long as the topic
needs to be taught properly — a broad, multi-concept topic is typically
~4,000–6,000 words, a narrow one (a single API flag, one pattern) can be
~1,500–2,500. Don't pad a narrow topic and don't compress a broad one into
bullets to hit a number. `--deep` (`depth: deep`): textbook depth, every edge
case worked through. `--brief` (`depth: brief`): a ~800–1,500 word refresher
that still uses prose and one example.

**Diagrams.** The notes viewer renders [Mermaid](https://mermaid.js.org) fenced
code blocks as real diagrams. Whenever a concept is genuinely clearer as a
picture — flows, sequences, state machines, hierarchies, timelines — prefer a
` ```mermaid ` block over ASCII art. Use the diagram type that fits: `flowchart`
for processes/branching, `sequenceDiagram` for message exchanges between actors,
`stateDiagram-v2` for lifecycles/state machines, `erDiagram` for data models,
`gantt`/`timeline` for time. Keep each diagram focused (a handful of nodes) and
write valid Mermaid syntax. Reserve plain ` ```text ` blocks for cases where
literal monospaced layout matters more than a rendered diagram. Real source code
still goes in language-tagged blocks (` ```js `, etc.) so it is syntax-
highlighted, not turned into a diagram.

**Language.** If the user asked for the lecture in a specific language (e.g.
"teach me X in Polish", or a non-English topic clearly signalling the desired
language), write the **entire** lecture in that language — including the section headings. Default to English when no language is requested. Write the quiz in the same language as the lecture.

**Reference chapter.** In this repo,
`teach-me/lectures/01-agentic-loop-and-tool-use/lecture.md` is the model the user
approved. Read it before writing a new chapter and match its voice and rhythm.

**Ground the examples in real code.** When the running example comes from repo
code or fixtures, take payloads, ids and outputs from that code, and run it
(`npx tsx` on a scratch script) when you show what it returns. Don't write
plausible-looking output by hand: a lecture that disagrees with the lesson's
solution teaches the wrong thing.

**Check before saving.** Run

```bash
python3 $SKILL/scripts/check-lecture.py <root>/lectures/<slug>/lecture.md
```

Fix every `ERROR`. Treat each `WARN` as a prompt to look again, not a rule
(a worked example can be a table, for instance). Then reread the chapter as the
learner and check what the linter can't: every term defined before use, each
section opening with a problem rather than a definition, no paragraph that is
really a bullet list in disguise, and every fact backed by a source under
*Going deeper*.

If `--notes-only`: skip to **§5b** (manifest without quiz), then report the saved
path and stop (no quiz, no server).

## 5. Generate the quiz (dedicated subagent)

Spawn a subagent (Agent tool, `general-purpose`, inherits the session model) with
a prompt that:

- Includes the **full text of the lecture** you just wrote and the **contents of
  `$SKILL/questions.schema.json`**.
- Instructs it to produce a quiz of ~8 questions (more if the user asked) that
  tests the lecture's content, with a **mix of difficulties** (`recall`, `apply`,
  `analyze`) and a **mix of types**: mostly `multiple-choice` (exactly 4 options)
  plus a few `true-false`. Both types are auto-graded and every question needs an
  `explanation`. The site renders prompts/options/explanations as markdown:
  use single backticks for short inline identifiers (`` `count` ``), and for any
  multi-line or substantial code use a **fenced block** with a language tag and
  phrase the question so the code stands on its own, e.g.
  `"Given this function:\n\n\`\`\`js\n…\n\`\`\`\n\nWhy does …?"`. Do not cram a
  whole function into a single-backtick inline span.
- Sets `lectureSlug` to the slug, `title` to the lecture title, `generatedAt` to
  the current ISO timestamp.
- **Tags every question with `objectives`** (e.g. `["O27", "O37"]`) when the
  lecture covers exam objectives: pass the subagent the objective IDs + short
  names the lecture's sections are tagged with (from `plan.md`'s objectives
  table) and require at least one ID per question, only from that list. Aim
  for every listed objective to get at least two questions. The field is
  optional in the schema, so ad-hoc lectures without objectives stay valid.
- Writes every question prompt, option, and explanation in the **same language as
  the lecture** (tell the subagent the language explicitly when it isn't English).
- Returns **only** the JSON object conforming to the schema (use the `schema`
  option so output is validated).

Write the returned object to `<root>/lectures/<slug>/questions.json`, then
**validate** it:

```bash
python3 $SKILL/scripts/validate-quiz.py <root>/lectures/<slug>/questions.json
```

It prints `OK` (exit 0) or the failing location (exit 1), using `jsonschema` when
available and a structural fallback otherwise. If it reports a problem, fix or
regenerate the quiz until it passes.

### 5b. Update `library.json`

Rebuild it with `python3 $SKILL/scripts/build-library.py <root>`. The script
globs `<root>/lectures/*/lecture.md`, reads each one's front-matter and
`questions.json` (for `questionCount` and the union of question `objectives`),
and writes `<root>/library.json` with a top-level `generatedAt` and a `lectures`
array of entries (`slug`, `title`, `topic`, `date`, `depth`, `questionCount`,
`tags`, `objectives`, `notesPath`, `quizUrl`). `date` falls back to the slug's
date prefix only when the front-matter has none. Sorting is handled
client-side (numbered topic lectures first, then dated ones newest first).

## 6. Serve and open

Use the helper below to start (or reuse) the background server for `<root>` and
open the right URL.

- Target URL after creating a lecture: `http://localhost:<port>/notes.html?lecture=<slug>`
  (open the lecture itself to read first — the notes page has a "Take the quiz"
  button one click away). Exception: `--requiz` opens the quiz directly (§9).
- For `--list`: `http://localhost:<port>/index.html`
- Mock exam: `http://localhost:<port>/exam.html` (optional `?n=<count>`, default 40)

**Server helper:** run `bash $SKILL/scripts/serve.sh <root>` — it reuses a healthy
existing server (live PID in `<root>/.server.pid` whose recorded port answers) or
else starts a backgrounded static server (`python3 -m http.server`, falling back
to `npx serve` / `php -S`) on the first free port from `8765` up, records the
pid/port, and **prints the port** on stdout. Build the URL with that port, then
`open "<url>"` (macOS) to launch the browser.

Report the URL to the user in your final message so they can reopen it.

## 7. Reopen (`--open <slug>` / `@<slug>`)

Find the matching lecture by fuzzy-matching the slug against
`<repo>/teach-me/lectures/*/` (this repo uses only the project-local root). If multiple
match, ask which with `AskUserQuestion`. Version-sync that root
(`prepare-root.sh <root>`, §3), then serve and open its
`notes.html?lecture=<slug>` (§6) — reopening
a lecture lands on the lecture itself, not the quiz (the notes page links to the
quiz). No regeneration.

## 8. List (`--list`)

The root is `<repo>/teach-me/`. Run `prepare-root.sh <root>` (version-sync) and
`build-library.py <root>` (§5b), then serve and open `index.html` (§6). If it has
no lectures, tell the user.

## 9. Requiz (`--requiz <slug>`)

Locate the lecture (§7). Re-run **§5** (regenerate `questions.json`
from the existing `lecture.md`) and **§5b**, then serve and open its
`quiz.html?lecture=<slug>` (§6) — requiz is about the quiz, so it opens the quiz
directly. Do not touch `lecture.md`.

## 9b. Rewrite (`--rewrite <slug>`)

Upgrades an existing lecture to the current template without changing its slug,
so links and saved quiz scores keep working. This is the one case
where a lecture is overwritten (§2), and it happens only when the user asks.

1. Locate the lecture (§7). Read it, its `questions.json`, the template, and the
   reference chapter (§4).
2. Re-check the facts against the current docs listed under *Going deeper*
   (this repo's content rules), and rewrite `lecture.md` per §4, keeping the
   same objectives and topic coverage. Run `check-lecture.py`.
3. Keep `questions.json` if its facts still hold. If the rewrite changed a fact,
   or the quiz tests something the lecture no longer teaches, regenerate it
   (§5). Validate it either way.
4. Find everything that points into the lecture by section name (in this repo,
   `grep -rn "<slug>" lessons/*/README.md`, i.e. the "Read first" lines) and
   update the section names.
5. Rebuild the library (§5b) and open the notes page (§6).

To rewrite several lectures, give each one to its own subagent with these steps,
the template and the reference chapter, then run `check-lecture.py` on all of
them yourself before reporting.

## 10. Stop (`--stop`)

Run `bash $SKILL/scripts/stop.sh <repo>/teach-me` (also pass
`~/.claude/teach-me` if it exists and has a `.server.pid`). It kills each recorded PID if alive, removes the pid/port files, and
prints what it did. Report that back to the user.

## 11. Exam-prep extensions (this repo)

**Objectives on questions.** `questions.schema.json` allows an optional
per-question `objectives` array (`^O[0-9]{2}$`, at least one, unique). IDs are
the plan's O01–O37. `validate-quiz.py` checks them in both the jsonschema path
and the structural fallback.

**Per-objective results (quiz.html).** When questions have `objectives`, the
results screen shows a table per objective (id, correct/total, %), weakest
first; rows under 72% are flagged. A question with several IDs counts toward
each of them.

**Mock exam (`exam.html`, linked from the library).** Loads `library.json`,
fetches every lecture's `questions.json`, and draws `?n=` questions (default 40)
with the same answering UX as the quiz (same `Quiz` renderer in `app.js`).
Sampling is round-robin across objective IDs: each pick serves the
least-covered objective so far (random tie-break) with a random question from
it; a multi-objective question counts toward all of its IDs; questions without
objectives only fill slots left once all objectives are exhausted; the final
order is shuffled. Results show raw %, the per-objective table, and an
**estimated** scaled score `round(100 + 900 × fraction)` on 100–1000 with pass
mark 720, labelled "estimate — not the official scoring formula".

**localStorage keys** (per portal origin, i.e. per port):

| Key | Value |
| --- | --- |
| `teach-me:score:<slug>` | latest quiz score `{ correct, total, at }` (original behavior) |
| `teach-me:objectives:quiz:<slug>` | `{ "O01": { correct, total, at }, … }` latest result per objective from that lecture's quiz |
| `teach-me:exam:score` | latest mock exam `{ correct, total, scaled, at }` |
| `teach-me:objectives:exam` | same shape as the quiz store, from mock exams |

Each attempt overwrites only the objectives it covered.

**Export progress** (button on the library page and on every results screen)
downloads `progress.json`, the LATEST attempt per objective across all of those
stores:

```json
{
  "exportedAt": "2026-10-18T09:00:00.000Z",
  "objectives": {
    "O01": { "correct": 2, "total": 3, "lastAttempt": "2026-10-18T08:55:12.000Z", "source": "quiz:01-agentic-loop-and-tool-use" },
    "O27": { "correct": 5, "total": 6, "lastAttempt": "2026-10-18T08:59:40.000Z", "source": "exam" }
  }
}
```

---

## Notes

- `file://` is an offline fallback only — `fetch()` of JSON is blocked there, so
  always serve over HTTP. The site shows a clear message if opened from `file://`.
- The static site files are generic; version-sync may overwrite them freely. User
  content (`lecture.md`, `questions.json`, `library.json`) is never overwritten by
  sync.
- Global and project-local portals run on different ports → separate `localStorage`
  scores. That is expected. The server picks the first free port from 8765, so
  if the port changes the browser sees an empty store: export progress before
  stopping the server if you want to keep it.
