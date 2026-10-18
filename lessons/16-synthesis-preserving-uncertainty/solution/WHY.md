# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Schema with one entry per claim, a status enum, and supporting / conflicting / discounted sources | The output format decides what the model *can* say. A single `conclusion` + `confidence` has no place for "these two good studies disagree", so the model collapses them. | "Synthesis collapses conflicting data into one confident statement" → give uncertainty a field |
| Three statuses: well-established, contested, insufficient-evidence | "Contested" (good evidence that disagrees) and "insufficient" (too little good evidence) need different follow-up actions, so they shouldn't be merged. | Distinguish established findings from contested claims |
| Source weighting by type and age, with reasons | A vendor "+40%" with no method, a single-team blog and a 2009 study of a *different* intervention shouldn't outweigh a randomised trial. Reasons keep the discount auditable. | Source quality and recency questions; "the agent favoured SEO content farms" |
| Classification by evidence, not majority vote | Five "no change" sources vs one randomised "−9%" isn't "well-established no change". Agreement among *kept* sources decides it. | "Most sources agree, so report it as fact" is the trap |
| Discounted sources are listed, never silently dropped | The reader can see *why* the +40% headline isn't in the brief. Hiding it looks like an oversight. | Transparency about excluded evidence |
| Prompt carries source metadata (date, type, basis) and the evidence table | The synthesis model can only weigh what it can see. Bare excerpts strip out the information needed to judge reliability. | Pass metadata through every hand-off (same principle as O03) |
| "Present both sides of a contested claim" + "never merge conflicting evidence" | Explicit instruction about the behaviour you want, not just the format. | Prompt wording for uncertainty |
| Deterministic validation after the model call | The model can still overclaim. Code checks status, conflicts, discounted citations and invented ids against the evidence. | Verify model output against ground truth you control |
| All issues in **one** `is_error` tool result, one revision | Specific, batched feedback gives one consolidated fix, rather than a long back-and-forth (the same technique as O12 iterative refinement). The `tool_result` must answer the forced `tool_use`. | Evaluator-optimizer pattern; batched feedback |
| `maxRepairs`, returning the remaining issues | Bounded cost. Unresolved issues are surfaced to a human, not hidden. | Reliability: bounded loops with transparent failures |

Anthropic's research system uses a separate CitationAgent that attaches sources to claims after synthesis. Keeping
`supporting_sources` / `conflicting_sources` in the schema from the start serves the same purpose: no claim
without a citation.
