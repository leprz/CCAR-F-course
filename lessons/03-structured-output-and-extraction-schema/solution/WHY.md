# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Structured outputs (`output_config.format: {type: "json_schema", schema}`) when a guarantee is needed | Constrained decoding: the response always parses and matches the schema, with no retries for schema violations | "Downstream parser must never fail" → schema-enforcing method, not prompt wording |
| Forced tool with `input_schema` on a model without structured outputs | The classic way to guarantee shape: `tool_choice: {type:"tool"}` + read `tool_use.input` | O25 answer on older models; also O27 in Part 1 |
| Prompt-only for best effort | Cheapest, and good enough when an occasional retry is fine | "Most reliable" vs "simplest": read which one the question asks for |
| Prefill never counts as a guarantee | Prefill only seeds the first tokens, and it returns a 400 error on Claude 4.6+ models (all 5.x) | A classic distractor: "prefill `{` to force JSON" |
| Every field `required` + `type: [X, "null"]` | Absent becomes an explicit `null`. A required non-null field *forces* the model to invent a value | O26: "allow the model to represent missing information without fabricating" |
| Enum escape values: `"other"` and `null` | A closed enum with no exit forces a wrong label on unexpected input | Enum trap: a contract forced into `invoice`, an unknown currency forced into `USD` |
| `ambiguous_fields` | Lets the model flag "02/03/2026" instead of silently picking a reading; feeds human review routing (Part 3, O22) | "Field-level ambiguity" |
| `additionalProperties: false`, no `minimum`/`maxLength` | Structured outputs rejects unsupported constraints with a 400. Put such constraints in `description` instead | Schema-limitation questions |
| Check `stop_reason` before parsing | The schema guarantee doesn't hold for `refusal` or `max_tokens` responses | "Valid JSON most of the time, but occasionally truncated" |

Optional vs nullable: both let the model avoid inventing. Required + nullable makes "I looked and it isn't there" explicit
and keeps every record the same shape, which downstream code and comparison scripts prefer.
