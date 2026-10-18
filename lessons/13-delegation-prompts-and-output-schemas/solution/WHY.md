# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| **Goal-oriented** prompt: objective + success criteria + boundaries, no step list | The subagent can adapt to what it finds (skip an off-topic source, dig into a conflict). Anthropic's research system gives each subagent "an objective, an output format, guidance on tools and sources, and clear task boundaries". | O04: pick the approach that "enables adaptive behavior" |
| Visibility comes from the **required report**, not from micromanaging | `gaps` and `sources_consulted` (used / discounted + reason) show the coordinator what happened and what's missing, so it keeps control without dictating steps. | O04: "…while maintaining coordinator visibility and control" |
| Procedural only for mandated sequences | Regulated or audited flows must run exactly. Elsewhere, step lists break the first time reality differs. | "Compliance requires these exact checks in order" → procedural |
| Prior findings with source ids and confidence go **into the prompt** | The Agent tool's prompt string is the *only* channel from parent to subagent. There's no shared history, so anything left out gets rediscovered or contradicted. | O03: "without returning to the coordinator for missing context" |
| Source table with id/title/org/date/type/url | The subagent can weigh evidence (2009 vs 2026, vendor vs peer-reviewed) without opening every file to find out. | O03 "source metadata" |
| Out-of-scope lists what *other* subagents cover | Stops duplicate work. The Anthropic research post describes subagents duplicating each other's searches under vague delegation. | Overlap / duplication scenarios |
| Findings as structured objects with `source_id`, `source_date`, `source_type`, `evidence_quote` | Synthesis needs to attribute, date and weigh each claim. Prose summaries lose that ("game of telephone"). | O18: format "best suited to downstream synthesis" |
| `summary` prose **plus** structured findings | Humans read the summary; machines merge the findings. Facts live in findings, never only in prose. | Structured + prose + citation questions |
| `stance` and `confidence` enums; `metric` nullable | Keeps disagreement visible for Part 6's synthesis (O19). Nullable avoids invented numbers. | Uncertainty-preserving synthesis |
| Parser extracts the last ```json block and **rejects** bad citations, listing every error | Models wrap JSON in prose. Unknown source ids are fabrications, so fail loudly and re-ask instead of silently accepting. | Validation / retry-with-feedback |
| `toSynthesisInput` groups by claim and keeps every finding | The merge step mustn't collapse conflicting evidence into one statement. | Feeds O19 in Part 6 |

Related patterns: for large outputs, subagents can write to files and return a reference (lightweight hand-off). Use
`omitClaudeMd` for agents that should depend only on the delegation prompt. When the Agent SDK *main* query needs
guaranteed JSON, `Options.outputFormat` (structured outputs) is available. Subagent reports, though, come back as text
to the coordinator, so the schema lives in the prompt and is validated on arrival.
