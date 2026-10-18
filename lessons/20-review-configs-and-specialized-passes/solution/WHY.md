# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Three passes, not one "find everything" prompt | One prompt juggling security, logic and API design trades recall between them: attention spent on rounding is not spent on the IDOR. A focused prompt per concern has its own examples and its own definition of done. | O24: "separate concerns into focused prompts… preventing recall trade-offs" |
| Few-shot examples per pass, all of that pass's category, plus a negative ("looks bad, is fine") | Examples teach the exact finding format and the threshold. The negative example teaches what *not* to report. | Few-shot is the lever for consistency and precision |
| "Ignore X; other passes cover it" + dropping out-of-lane findings | Keeps each pass in its lane, and code enforces it in case the model strays. Duplicates across passes are merged by category + file + line. | Overlapping passes → dedupe, don't widen prompts |
| CONVENTIONS.md (with accepted patterns) in every pass's system prompt | False positives come from the reviewer not knowing local rules. Persistent context applied on *every* review fixes that at the source. | O30: "supply project conventions / accepted patterns / exclusions as persistent context" |
| Explicit exclusion criteria: no style nits, only named-rule violations | Defines a boundary where the model's judgement is unreliable or unwanted. | Inclusion/exclusion criteria (O31, Part 2) |
| `report_findings` tool, forced, with enums + nullable `line` + required `rule` | Downstream automation parses it, so the schema is the contract. A nullable `line` avoids invented line numbers. | O13: "structured output suitable for downstream processing" |
| Reviewer subagents with `tools: Read, Grep, Glob` | Omitting `tools` inherits **everything** (Edit, Bash, MCP). A reviewer has no reason to edit; the allowlist is the reliable restriction (a subagent's `permissionMode` is ignored when the parent runs in `bypassPermissions`, `acceptEdits` or auto mode). | O13: "restrict unnecessary tool access" |
| `@CONVENTIONS.md` import in CLAUDE.md | Standards load in every session and every subagent (subagents load CLAUDE.md unless `omitClaudeMd`). | "Load the correct project standards" |
| `.claude/review-schema.json` + `--json-schema` in CI | `claude -p --output-format json --json-schema …` puts validated output in `structured_output`. | CI review output → JSON schema, not regex on prose |

Alternatives to know: the bundled `/code-review` skill and the GitHub Actions integration give you a review out of the
box. The exam asks *why* a custom config needs these properties.
