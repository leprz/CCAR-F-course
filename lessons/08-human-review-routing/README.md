# L08 — Routing extractions to human review

**Objective:** O22 (route extractions to reviewers by confidence scores, document characteristics and field-level ambiguity, not by random sampling)
**Scenario:** accounts-payable inbox (`fixtures/invoices/`), last night's run in `scenario.ts`
**Read first:** [Part 3 lecture](../../teach-me/lectures/03-processing-modes-and-review-routing/lecture.md), sections 4–6 (*4. Why not just review a random sample?*, *5. Which signals should send an extraction to a person?*, *6. How do you know the routing works?*)

## Situation

The overnight batch from L07 extracted seven documents. Finance can't check everything by hand, so today a random 20%
goes to a reviewer, who re-reads the whole document. Last night's run (`scenario.ts`) has three wrong extractions:

- **INV-2**: an EU decimal misread (`123456` instead of `1234.56`). The model reported 0.95 confidence.
- **INV-4**: a handwritten "5/3" read as May 3rd. The model reported 0.55 on that field.
- **INV-8**: a PO number copied from another document. It's confident and internally consistent, and wrong.

Random sampling will most likely wave all three through, while reviewers spend their time on clean invoices.

## Your task

Edit `starter/index.ts`:

1. `validateExtraction`: deterministic checks (line-item sum, sign, date order, fields required for payment).
2. `fieldSignals`: low self-reported confidence and model-flagged `ambiguous_fields`.
3. `documentSignals`: risky intake traits (handwritten, credit note), high value, non-payable documents.
4. `routeExtraction`: route on that evidence, with a priority and the **specific fields** to check.
5. `buildReviewQueue`: put the most urgent items first.
6. `evaluateRouting`: precision, recall and missed errors against ground truth.
7. `auditSample`: a small random sample, drawn **only from auto-approved items**, to estimate what the router misses.

```bash
npx vitest lessons/08
SOLUTION=1 npx vitest run lessons/08
npm run test:live -- lessons/08    # real extraction + confidence for INV-5 and INV-6, then routing
```

When you're done, notice which error the solution still misses, and why. Then read `solution/WHY.md`.
