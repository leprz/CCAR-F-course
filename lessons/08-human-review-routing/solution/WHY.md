# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Route on evidence about **this** extraction, not a random sample | Random sampling spends reviewer time in proportion to volume, not to risk. At a 20% rate it misses about 80% of errors. | "Route based on confidence, document characteristics and field ambiguity **rather than random sampling**" is the objective's own wording |
| Deterministic validation (line sum, sign, dates, required fields) | It catches **confident** mistakes. INV-2's model said 0.95 and was wrong by a factor of 100. Self-reported confidence isn't calibrated, so arithmetic beats it. | "The model reported high confidence, so skip review" is the trap |
| Field-level confidence with a policy threshold | Useful as *one* signal. Calibrate the threshold on labelled data (precision and recall), don't guess it. | Threshold tuning questions: measure, then adjust |
| `ambiguous_fields` from the schema (Part 2) | The model can say "this supports two readings" instead of guessing. That's the cheapest high-precision signal there is. | Schema design and routing reinforce each other (O26 → O22) |
| Document characteristics (handwritten, credit note, high value, not an invoice) | Some *inputs* are historically error-prone or expensive to get wrong, whatever the model says | "Route by document type and amount" |
| `fieldsToCheck` instead of "review the document" | Reviewers verify two fields in seconds, while re-reading a whole invoice takes minutes. Precise routing also tells you which fields fail most. | "Field-level" routing |
| High priority for failed arithmetic and high value | Those errors move money | Queue design |
| `evaluateRouting` with precision and recall | Recall is how many wrong extractions reach a human; precision is how much review effort is wasted. You can't tune what you don't measure. | "How do you know the routing works?" |
| Random audit **only of auto-approved items** | Its only legitimate job is to estimate the error rate the router lets through (INV-8 here) and feed that back into the policy | Random sampling as *calibration*, not as the routing mechanism |

What the solution still misses: **INV-8**. A confidently fabricated PO number passes every check. Ways to catch it:
look the value up against the PO system (an external validation tool), add a rule that the PO must appear verbatim in
the document text, or tighten the extraction prompt (Part 2, O26/O31). The audit sample is how you'd discover this class
of error in the first place.
