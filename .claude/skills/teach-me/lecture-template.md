<!--
  teach-me lecture template.
  The skill fills this in. Rules for the author (Claude):
  - Replace every <PLACEHOLDER> and remove all HTML comments before saving.
  - Keep all five section headings, in order. Default to the English wording below;
    if the lecture is requested in another language, translate the headings into
    that language too (keep them as five "##" headings in the same order).
  - "focused" depth = ~400-800 words total. "--deep" = expand each section freely.
  - Use fenced code blocks with language tags for any code.
  - For diagrams (flows, sequences, state machines, hierarchies, timelines),
    prefer a ```mermaid fenced block over ASCII art — the notes viewer renders
    it as a real diagram. Pick the fitting type (flowchart / sequenceDiagram /
    stateDiagram-v2 / erDiagram / timeline) and keep it focused.
  - The metadata header below is YAML front-matter; the skill lifts it into library.json.
-->
---
title: <Human-readable lecture title>
topic: <Short subject phrase, e.g. "TypeScript type inference">
date: <YYYY-MM-DD>
depth: <focused | deep>
tags: [<tag>, <tag>]
---

# <Human-readable lecture title>

## TL;DR

<2-3 sentences: what this is and why it matters. Tie it explicitly to the
context that triggered the lecture — the recommendation, the file, or the
decision being made.>

## Core concepts

<Explain the key ideas from first principles. Build up from the simplest
mental model to the real thing. Use short code examples where they clarify.
This is the longest section.>

```<lang>
<illustrative example>
```

## How it applies to what you were doing

<Connect the concepts back to the specific situation: the code under
discussion, the problem being solved, or the recommendation that prompted
this. Make the relevance concrete.>

## Trade-offs / when NOT to use it

<The nuance that separates understanding from memorizing: costs, limits,
failure modes, and the situations where a different approach is better.>

## Going deeper

<Pointers for further study: official docs, key articles, related concepts
to explore next, and a suggested next lecture topic if relevant.>
