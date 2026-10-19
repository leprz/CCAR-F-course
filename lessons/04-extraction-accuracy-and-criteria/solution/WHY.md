# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Normalisation rules with concrete examples (`'1.234,56 €' → 1234.56`) | Varied source formats cause inconsistent output; one canonical form per type with worked examples removes the guesswork | O29: "format normalization instructions … consistency across varied document formats" |
| 3 diverse few-shot examples in `<examples>` tags | The docs recommend 3–5 relevant, *diverse* examples wrapped in tags. Diversity covers edge cases (EU decimals, credit note, handwritten note) | "Add more examples of the common case" is the trap; coverage of edge cases is the answer |
| A fixed set, in the system prompt | Picked once by hand; the same prefix on every request is what prompt caching reuses. Per-request selection changes the prompt every call | Cost/latency questions on few-shot prompts |
| Examples kept out of the scored documents | A scored document that is also an example is copied, not extracted, and the scores mean nothing | Evaluation-leak questions |
| Exclusions as rules, examples only demonstrating them | An output shows *that* a field is null, not *why*; the rule names the category, reason and safe output | O31: unreliable category → explicit criteria, not more examples |
| `<exclude>` items with a reason and a safe output ("output null", "ignore") | The model needs an allowed action. Without one, a missing value pushes it toward a plausible invention | O31: "explicit inclusion and exclusion boundaries … where performance is unreliable" |
| Excluding computed due dates and currency inferred from country | These are categories where the model produces *confident wrong* values. Keep the raw terms and flag ambiguity instead | Distinguish "the model *can* compute this" from "it computes it reliably" |
| Code checks (sum of lines = total, ISO dates, credit-note sign) | The schema guarantees shape, not truth. Cheap deterministic checks catch value errors | "Structured output is valid but values are wrong" → validation layer |
| Retry with the *specific* issue ("total 1009.56 ≠ sum 1234.56") | Targeted feedback converges; "try again" doesn't | Also O12 (iterative refinement, L06) |
| Return the remaining issues after max attempts | Unresolved documents go to human review (Part 3, O22), not to silent acceptance or a crash | Routing questions |
