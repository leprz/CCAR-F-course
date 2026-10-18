# L16 — Synthesis that preserves uncertainty

**Objective:** O19 (synthesis that keeps source-level uncertainty, distinguishing well-established findings from contested claims instead of collapsing conflicting data into one confident statement)
**Scenario:** research team, `fixtures/research/` (graded against `ANSWER_KEY`)
**Read first:** [Part 6 lecture](../../teach-me/lectures/06-multi-agent-orchestration/lecture.md), sections 5–6 (*Synthesis that keeps the doubt* and *Checking the synthesis before anyone reads it*)

## Situation

The brief that reached leadership said: *"A four-day week increases productivity by up to 40%. Confidence: 0.9."*
That number comes from a vendor whitepaper (S6) with no disclosed method. The randomised study (S9), which found
total output **fell** 9%, isn't mentioned at all. The output schema had one `conclusion` field and one `confidence`
number, so there was nowhere to put a disagreement. The prompt asked for "one clear, confident answer", and every
source counted the same.

## Your task

Edit `starter/index.ts`:

1. `SYNTHESIS_TOOL`: one entry **per claim**, each with a status (`well-established` / `contested` /
   `insufficient-evidence`), supporting and conflicting sources, and discounted sources with reasons.
2. `weighSource`: weight sources by type, penalise outdated ones, and discount anything below the threshold, with reasons.
3. `classifyClaim`: classify from the evidence, not by majority vote. Discounted sources are set aside, too few strong
   sources means insufficient evidence, and disagreement means contested.
4. `buildSynthesisPrompt`: give the model source metadata, findings by claim and the evidence table. Tell it to keep
   conflicts visible.
5. `validateSynthesis`: catch overclaiming, dropped conflicts, reliance on discounted sources, missing claims and invented sources.
6. `synthesize`: an evaluator-optimizer loop. Send **all** issues back in **one** `is_error` tool result and revise once.

```bash
npx vitest lessons/16
SOLUTION=1 npx vitest run lessons/16
npm run test:live -- lessons/16    # a real synthesis must report output as contested and pass validation
```

When you're done, read `solution/WHY.md`.
