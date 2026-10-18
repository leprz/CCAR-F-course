# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Evaluate the whole set every round | A change that fixes one document can break another. Only a set-wide score shows whether a revision helped | "Fix-one-break-another" scenarios → consolidated evaluation |
| Field-level failures (doc, field, expected, actual) | Targeted feedback names *what* is wrong and *where*; "it's wrong, improve it" gives the model nothing to act on | O12: "targeted feedback on specific failures" |
| One batched message, grouped by field | The reviser sees patterns ("currency wrong on 3 docs") and fixes the cause once, instead of patching anecdotes one at a time | O12: "batched issue descriptions for consolidated evaluation" |
| Concrete `<input>` → `<expected>` / `<actual>` examples | Examples show the exact behaviour wanted, and they work better than describing it in the abstract | O12: "concrete input-output examples" |
| Cap examples per field | Two representative cases carry the pattern without flooding the context | Context budget |
| Keep the best prompt, not the last | Revisions can regress. Keeping history with scores makes it measurable | "Round 4 seems worse than round 2" |
| Stop at the target or after maxRounds | Refinement without a stop condition burns money and risks overfitting the eval set | Same idea as turn limits in agents |

Related: L04's retry loop applies targeted feedback to a single *output*. This lesson applies it to the *prompt*, across a set.
