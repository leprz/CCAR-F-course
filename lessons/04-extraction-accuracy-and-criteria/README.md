# L04 — Extraction accuracy patterns and explicit inclusion/exclusion criteria

**Objectives:** O29 (schemas + format normalisation + few-shot examples to reduce hallucination across varied formats), O31 (explicit inclusion and exclusion boundaries for categories where the model is unreliable)
**Scenario:** accounts-payable inbox (`fixtures/invoices/`), using the reference schema from L03
**Read first:** [Part 2 lecture](../../teach-me/lectures/02-structured-output-and-extraction/lecture.md), sections 3–4 (*How do you make the values right, not just the shape?* and *Where should the model refuse to answer?*)

## Situation

Structured outputs guarantees that the result has the right *shape*, but not that its *values* are correct. The pipeline now returns:
- `issue_date: "04.03.2026"` on the German invoice, and `1234` instead of `1234.56` on the same invoice
- a positive total on the credit note
- a handwritten margin note ("PAID?? check w/ Tom") copied into `payment_terms`
- a due date the model calculated from "within 15 days"
- the IBAN copied into `payment_terms`

## Your task

Edit `starter/index.ts`:

1. `NORMALIZATION_RULES`: one canonical form per value type, with concrete before→after examples.
2. `SCOPE` + `buildSystemPrompt`: `<include>` and `<exclude>` sections. Each exclusion gives a reason and the safe alternative output.
3. `formatExamples`: wrap the given `FEW_SHOT_EXAMPLES` (document + expected JSON) in `<examples>`/`<example>` tags. They go in
   the system prompt, identical for every document. *Choosing* examples is covered by the Part 2 quiz, not by code.
4. `validateExtraction`: deterministic checks the schema can't express (date format, line-item sum, credit-note sign).
5. `extractWithValidation`: retry with the *specific* validation errors as feedback, and return any remaining issues instead of throwing.

```bash
npx vitest lessons/04
SOLUTION=1 npx vitest run lessons/04
npm run test:live -- lessons/04
```
