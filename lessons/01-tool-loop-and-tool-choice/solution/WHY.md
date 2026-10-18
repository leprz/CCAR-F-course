# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Structured output through a `record_triage` tool, not `JSON.parse` on text | A tool's `input` is already parsed JSON shaped by `input_schema`. Text may come with preamble or invalid JSON. | "Downstream system fails on conversational responses" → tool + schema + forced `tool_choice` |
| `enum` + `required` in the schema | The schema is the contract. Enums stop the model inventing categories, and `required` stops missing fields. | O27: "enforce structured output compliance" |
| `tool_choice: {type:"tool", name:"lookup_customer"}` on turn 0 | Guarantees the prerequisite runs before anything that needs its output. Descriptions only *ask*, while `tool_choice` *forces*. | O37: "sequence multi-tool workflows so prerequisite data is obtained first" |
| `auto` in the middle | The model decides which investigations it needs. Forcing every step makes the agent rigid. | Forcing everything is a trap answer |
| Forced finalize call when the model replies in prose | `auto` lets the model answer in text. When text would break the consumer, force the output tool for one last call. | "guarantee tool invocation when conversational responses would cause downstream failures" |
| Errors returned as `is_error: true` with instructions, not thrown | The model can read the error and adapt (here, mark `needs_human`). A thrown exception kills the loop. | Recovery questions: "return the error to the model" beats "retry blindly" or "crash" |
| Assistant turn appended verbatim | `tool_result.tool_use_id` must match a `tool_use` in the immediately preceding assistant message. | 400 "tool_use ids were found without tool_result blocks immediately after" |
| `maxTurns` guard | Stops runaway loops and their cost. | Same idea as `--max-turns` in Claude Code CI (O11) |

Alternatives to know:
- `tool_choice: {type: "any"}` forces *some* tool without picking which one.
- `strict: true` on the tool guarantees that inputs match the schema. Pair it with `any`/`tool` on models that support forcing, or with `auto` on models that don't (Opus/Sonnet 5.5).
- With `any` or `tool`, the model emits no text before the `tool_use` block. If you want commentary, use `auto` plus an instruction.
