# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| **Structured state object** (`CaseState`) next to the prose summary | Summaries paraphrase: "$899.99" becomes "about $900", and "within 5 business days" becomes "soon". Ids, amounts, dates and promises live in a JSON object that is merged, never re-summarized. | "Agent forgot the exact refund amount after a long conversation" → persist key facts in a structured state, not just a summary |
| Facts extracted with a **forced tool** | Structured extraction must be reliable. This reuses Part 1's `tool_choice` pattern. | Combines O21 with O27 |
| **Selective retention** in `mergeState` | Not every fact needs keeping. Identifiers and commitments accumulate; transient things (open issues) get replaced; small talk is dropped. | "Which information should survive compression?" → ids, numbers, decisions, promises |
| Summary prompt says **"exact, never paraphrased"** | A generic "summarize briefly" is the classic cause of lost details. | Progressive-summarization trap answers |
| **Sliding window cut at human-turn boundaries** | Cutting in the middle of a tool exchange gives a `tool_result` with no matching `tool_use` (400), or a history that starts with an assistant turn. | Naive `slice(-N)` distractors |
| State in the **system prompt**, summary **first**, recent turns **verbatim, last** | Stable facts at the top, the current exchange at the end where it's freshest. The recent turns keep their exact wording. | "Where should key facts go in a long context?" → beginning or a dedicated block, not buried in the middle |
| **Token counting API**, not chars ÷ 4 | Free (rate-limited), uses the target model's tokenizer. Newer tokenizers produce ~30% more tokens for the same text. | Budget decisions before sending |
| Re-check the budget after compacting | Compaction can still overflow (huge recent turns), so fail loudly instead of sending a request that gets a 400. | Defensive design |

**Current API alternatives** (they don't replace understanding the pattern):
- **Server-side compaction** (beta, `compact-2026-09-04`): the API writes the summary, on demand or at a token threshold.
- **Context editing** (beta `context-management-2025-06-27`): `clear_tool_uses_20250919` clears old tool results by
  rule (`trigger`, `keep`, `clear_at_least`, `exclude_tools`); `clear_thinking_20251015` handles old thinking blocks.
  You can pair it with the memory tool so Claude saves facts before they're cleared.
- **Claude Code** auto-compacts: it clears old tool outputs first, then summarizes. Use `/compact focus on …` or a
  "Compact Instructions" section in CLAUDE.md to steer it, and keep persistent rules in CLAUDE.md, not in the chat.
