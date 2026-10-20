<!--
  teach-me lecture template: a book chapter, not a cheat sheet.
  The skill fills this in. Rules for the author (Claude):
  - Replace every <PLACEHOLDER> and remove all HTML comments before saving.
  - Write like a good technical book: full paragraphs that explain *why* before *what*, a running
    example that grows through the chapter, and concrete payloads/code the reader can trace by hand.
    Bullet lists are for genuine lists (options, steps, checklists), never as a replacement for explanation.
  - Length follows the subject (see SKILL.md §4 "Length"). Do not pad a narrow topic; do not compress a
    broad one into bullets to hit a number.
  - Keep the skeleton below in order: opening, running example, numbered concept sections, putting it
    together, summary, traps, practice (exam-prep repo only), going deeper. The number of concept
    sections is up to the subject (usually 3-7).
  - In the exam-prep repo the chapter must read standalone: never mention lessons, starters or solutions
    in the body ("Here's the request Lesson 7 builds" -> "Here's the batch request"). Lesson pointers go
    only in the closing Practice section.
  - If the lecture is requested in another language, translate the headings too.
  - Use fenced code blocks with language tags for code and payloads (```json, ```ts). Use ```mermaid for
    flows/sequences/state machines where a picture is genuinely clearer; keep each diagram small.
  - "Check yourself" answers go in <details><summary>…</summary> with a BLANK LINE after </summary>
    so the markdown inside renders.
  - The metadata header below is YAML front-matter; the skill lifts it into library.json.
-->
---
title: <Human-readable chapter title>
topic: <Short subject phrase, e.g. "TypeScript type inference">
date: <YYYY-MM-DD>
depth: <chapter | deep | brief>
tags: [<tag>, <tag>]
---

# <Human-readable chapter title>

<Opening, 2-4 paragraphs, no heading. Start from a concrete problem the reader recognises, not a
definition. Say why the topic matters and what goes wrong without it. End with what the reader will be
able to do after this chapter. In the exam-prep repo, follow with the Objectives / Sources line.>

## The running example

<Introduce ONE scenario used throughout the chapter: who the users are, what the system must do, and the
concrete data (records, ids, a sample input). Show the data. Every later section builds on it, so the reader
never has to re-learn a new toy example.>

## 1. <First concept, named by the question it answers>

<Teach in this rhythm, as prose:
 1. The problem: what the reader would try first, and why that's not enough.
 2. The idea: explain it from first principles, building from the simplest mental model to the real thing.
    Define every new term the first time it appears.
 3. Worked example: apply it to the running example, step by step. Show the actual request/response or code,
    then walk through it ("Notice that…", "The id here is the one from step 2…").
 4. What goes wrong: the common mistake, shown concretely (the broken payload/code and the symptom), then the fix.>

```<lang>
<worked example from the running scenario>
```

> **Check yourself:** <one scenario question that applies this section, not a recall question>
>
> <details><summary>Answer</summary>
>
> <the answer, with the reasoning and why the tempting wrong answer is wrong>
>
> </details>

## 2. <Next concept>

<Same rhythm. Refer back to earlier sections and to the running example's state ("the customer id we got in
section 1"). Each section should leave the running example a little more complete.>

## <N>. Putting it together

<Assemble the pieces into the complete, working version of the running example (full code or a full
end-to-end transcript), and narrate one run through it. This is where the reader sees how the concepts
interact.>

## Summary

<A short recap the reader can reread before an exam: one paragraph or a tight list of the key ideas, each
in one sentence. This is the only place where terse is the goal.>

## Traps and decision rules

<The nuance that separates understanding from memorising: when NOT to use it, costs, failure modes, and
scenario -> decision rules ("If you see X, the fix is Y, not Z because…"). In the exam-prep repo, phrase these
the way the exam frames them and name the tempting wrong answers.>

## Practice

<Exam-prep repo only. One line inviting the reader to build the running example, then one bullet per lesson:
**Lesson N — <title>** (`lessons/NN-slug/`): what you build or fix. End with a **Quiz:** bullet. Use
inline-code paths, not links (the portal strips links to lessons/).>

## Going deeper

<Official docs and key articles (with one line on what each covers), related concepts, and the suggested
next chapter.>
