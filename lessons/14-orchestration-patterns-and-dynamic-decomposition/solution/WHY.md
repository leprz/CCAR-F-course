# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| `single-agent` for simple lookups and tightly coupled work | Agents use ~4× the tokens of chat and multi-agent systems ~15×. Work with heavy shared context or edits to the same files (most coding) is a poor fit, because the workers would have to re-learn each other's context. | "Simplest solution that works": a multi-agent answer to a one-fact question is a distractor |
| `sequential-pipeline` when each step consumes the previous output | Prompt chaining trades latency for accuracy and lets you put gates between stages. Running dependent steps in parallel just makes them wait or guess. | "Each stage needs the previous stage's result" → pipeline |
| `parallel-fanout` when the subtasks are known and independent | Lowest latency: N independent subtasks take one round trip, not N. | "Known independent sections, latency matters" → fan-out (sectioning) |
| `coordinator-worker` when the subtasks can't be predicted | The orchestrator decides subtasks from the input and from intermediate results. That's the key difference from parallelization, where subtasks are predefined. | "Can't know up front what needs investigating" → coordinator |
| Effort scaling (1 / 2–4 / 10+ agents) | Without explicit rules, coordinators over-invest in simple queries. Anthropic embeds these rules in the lead agent's prompt. | Questions about cost blow-ups on simple queries |
| `Promise.all` within a round | Breadth-first research gets its speed from parallel subagents. Anthropic reports up to 90% less time on complex queries. | Latency questions: parallelise independent work |
| Leads become new surveys | Start broad, then narrow. The initial plan can't know every angle; what the workers *find* reveals new ones (on-call, collaboration). | O07: "adapt as new information is discovered" vs "execute a fixed sequence" |
| Conflicts become targeted follow-ups naming the disagreeing sources | A contradiction is a finding, not noise. The follow-up investigates *why* the sources disagree (method, population, date, intervention). | Dynamic decomposition scenario: "the intermediate result changes what to do next" |
| `planned` set: nothing is planned twice | Prevents loops where the same conflict spawns a follow-up every round. | Runaway agent / duplicated work |
| `maxRounds` / `maxTasks`, with `unexplored` reported | Budgets bound cost, and reporting what was cut lets synthesis say "not investigated" instead of implying completeness. | Reliability: budgets plus transparent gaps beat silent truncation |

Not tested here, but worth knowing: the coordinator waits for every worker in a round before planning the next.
Anthropic calls this synchronous execution a bottleneck (one slow worker stalls the round) but keeps it because
asynchronous coordination complicates state and error handling.
