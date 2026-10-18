# L06 — Iterative refinement with examples, targeted feedback and batched issues

**Objective:** O12 (structure iterative refinement: concrete input-output examples, targeted feedback on specific failures, batched issue descriptions for consolidated evaluation)
**Scenario:** accounts-payable inbox (`fixtures/invoices/`)
**Read first:** [Part 2 lecture](../../teach-me/lectures/02-structured-output-and-extraction/lecture.md), section 6, *How do you improve the prompt without going in circles?*

## Situation

The team improves the extraction prompt with Claude's help, but the loop isn't converging. After each document, they send one
failure ("this one's wrong, please improve the prompt") and accept whatever comes back. Fixing the German invoice breaks the
Polish one, and nobody can tell whether round 4 is better than round 2.

## Your task

Edit `starter/index.ts`:

1. `evaluate`: field-level scoring over `KEY_FIELDS` for the **whole set**. Each failure names the document, the field, and the expected and actual values.
2. `buildBatchedFeedback`: **one** message per round. Failures are grouped by field, with concrete `<input>` → `<expected>` / `<actual>` examples (capped per field).
3. `refinePrompt`: evaluate everything, make **one** revision call with the batched feedback, then re-evaluate everything. Stop at the target or after `maxRounds`,
   and return the **best** prompt seen.

```bash
npx vitest lessons/06
SOLUTION=1 npx vitest run lessons/06
npm run test:live -- lessons/06
```
