# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Policies as **resources** (`shop://policies`, `shop://policies/{topic}`) | Resources are passive, read-only context that the **application** controls. The host lists, picks and attaches them, so the model doesn't spend turns discovering them. | "Agent makes many exploratory list/get calls before acting" → expose that content as resources |
| Order, customer and search operations stay **tools** | Tools are model-controlled operations on live data, chosen per request with typed inputs. | "Should X be a tool or a resource?" Static and browsable → resource; an action or a parametrised live query the model decides on → tool |
| Index resource plus a template with a `list` callback | The index gives a catalogue in one read. `list` makes each concrete URI show up in `resources/list`, which Claude Code's `@` autocomplete uses (`@shop:shop://policies/refunds`). | Resource templates (`{param}` URIs) for parametrised content |
| Host reads resources in `loadPolicyContext` | Zero model round trips and zero `tools/call`. Claude Code does the same when you @-mention a resource: it's fetched and attached. | "Reduce latency/cost of gathering reference context" |
| Descriptions that name the sibling tool ("use search_orders instead") | With look-alike tools, the most common failure is the model picking the wrong one. Stating boundaries and pointing to the alternative fixes routing. | O36: "distinguish each tool's purpose, input formats, use-case boundaries and relationships to similar tools" |
| Input format with an example (`"A1002"`, an email address) | The model maps what's in the ticket to the right parameter by its shape. | Misrouting caused by ambiguous inputs |
| 3+ sentences per description | Tool-use docs: detailed descriptions are "by far the most important factor in tool performance". | Short-description distractors |

Trap answers to recognise:
- "Add a system-prompt rule listing which tool to use when." That's fragile, and the description travels with the tool.
- "Merge all three into one `query` tool." That hides the distinction instead of describing it, and is a different design choice.
- "Turn order lookups into resources." Live, per-request data the model decides to fetch is a tool.
