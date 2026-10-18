# L11 — AgentDefinition, role tools and context scoping

**Objectives:** O05 (subagent tool restrictions, context scoping, system prompts that constrain each agent to its role), O33 (tool distribution: each subagent gets only its role's tools)
**Scenario:** research team, `fixtures/research/` ("does a four-day week improve software team productivity?")
**Read first:** [Part 5 lecture](../../teach-me/lectures/05-subagents-agent-sdk/lecture.md), sections 1–3 (*What does a subagent actually see?*, *How do you define a subagent?* and *Which tools should each agent get?*)

## Situation

A research app on the Claude Agent SDK has a coordinator and three specialists. In a recent run the coordinator skipped
delegation and ran 40 web searches itself, the source analyst edited a source file, and the report writer went off to
search the web. Every agent has every tool, the descriptions are a single word, and the run picks up whatever the
developer has in `~/.claude/settings.json`.

## Your task

Edit `starter/index.ts`:

1. `ROLE_TOOLS`: give each specialist least-privilege tools and wire them into `SUBAGENTS`. No specialist gets the spawn tool.
2. `SUBAGENTS[*].description`: say what each agent does and when to use it. The coordinator routes on these alone.
3. `COORDINATOR.tools`: the spawn tool plus reading and listing files. No search, fetch, write or Bash.
4. `buildOptions`: run the coordinator as the main thread (`agent`), register all agents, pre-approve exactly what's needed,
   deny anything else without prompting, isolate from filesystem settings, and cap turns and spend.
5. `effectiveTools`: model how `tools` and `disallowedTools` resolve. Omitting `tools` means *inherit everything*.
6. `isSubagentCall`: detect delegation under the current tool name **and** the legacy one.

```bash
npx vitest lessons/11
SOLUTION=1 npx vitest run lessons/11
npm run test:live -- lessons/11      # spawns Claude Code via the Agent SDK (needs auth)
```

## Version notes

- The spawn tool is **`Agent`** in `tool_use` blocks. It was **`Task`** before Claude Code v2.1.63, and the `system:init` tools list
  still says `Task`. Exam questions and older code may say "Task tool". It's the same thing.
- `allowedTools` **only pre-approves**. The tools an agent *has* come from its definition's `tools` (or `Options.tools` for the
  base set). Mixing these two up is the most common misconfiguration, and L12 turns it into a diagnosis exercise.

When you're done, read `solution/WHY.md`.
