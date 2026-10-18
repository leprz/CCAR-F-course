# Why the solution looks like this

| Choice | Reason | Exam signal |
|--------|--------|-------------|
| Glob = file **names**, Grep = file **contents**, Read = a **known** file (or window), Bash = **run** something | Each returns the least text for its question. Grep's default `files_with_matches` mode returns paths only, `content` returns lines, `count` returns counts. | O32: "find files named…" → Glob; "find where X is called" → Grep; "run tests / git history" → Bash |
| K6 "which file defines class X" → Grep | You know the content (`class OrderRepository`), not the file name. | Glob-vs-Grep trap |
| K7 slice of a huge log → Read with offset/limit | Reading the whole file wastes context. `cat` via Bash is a worse version of the same thing. | Targeted reads |
| K8 counts per file → Grep in count mode | No need to pull matching lines into context. | |
| Explore: Glob → Grep → Read windows → follow one reference | Build understanding in small steps and stop when answered. Measured here: well under ¼ of the codebase enters context. | O17: "build incremental understanding while managing context" |
| Follow the `req.principal` hand-off before flagging | Three of the four "obvious" findings were false. Reading one more hop (what the handler passes on) is the cheap check. | Precision over "grep and report" |
| Explorer subagent: `tools: Read, Grep, Glob`, model haiku | Read-only, cheap, keeps file contents out of the main context and returns a summary. | Subagent isolation for investigation (see also O20) |
| Naming `Grep`/`Glob` in the subagent's `tools` | **Current behaviour:** on macOS/Linux/WSL, Claude Code leaves Glob and Grep out of the default tool set and searches with `find`/`grep` (bundled `bfs`/`ugrep`) via Bash. Listing them in a subagent's `tools` without `Bash`, or in `--tools`/`--allowedTools`, brings them back. The exam's classic framing is the dedicated tools. | Know both |
| Test prompt: code + dependency + existing tests + conventions + criteria + edge cases | Existing tests teach style and the `makeOrder`/`makeLine` factories. Criteria separate behavioural tests from assertions like `toBeDefined`. Named edge cases point the model at the business rules (BIZ-1, BIZ-2). | O15: "provide existing test files as context, define fixture conventions, specify criteria" |
| "Don't change expected values to make a failing test pass" | A failing behavioural test against buggy code is a *finding*. | Tests that pass against a bug are worthless |
| `isTrivialTest` | A cheap automated gate on generated tests before a human looks at them. | Quality gates on model output |
