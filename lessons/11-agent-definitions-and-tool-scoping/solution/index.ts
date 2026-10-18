import type { AgentDefinition, Options } from '@anthropic-ai/claude-agent-sdk';
import { modelFromEnv } from '../../../lib/claude.ts';

/**
 * A research system on the Agent SDK: a coordinator that only plans and delegates, and three
 * specialists that each get exactly the tools their role needs.
 */

export const SUBAGENT_NAMES = ['source-analyst', 'web-researcher', 'report-writer'] as const;
export type SubagentName = (typeof SUBAGENT_NAMES)[number];

/** Least privilege per role. No subagent gets `Agent`, so specialists cannot spawn further agents. */
export const ROLE_TOOLS: Record<SubagentName, string[]> = {
  'source-analyst': ['Read', 'Grep', 'Glob'],
  'web-researcher': ['WebSearch', 'WebFetch'],
  'report-writer': ['Read', 'Write'],
};

export const SUBAGENTS: Record<SubagentName, AgentDefinition> = {
  'source-analyst': {
    description:
      'Reads the local source documents in sources/ and extracts findings with their source metadata. ' +
      'Use for any question that the provided corpus can answer. Read-only.',
    prompt:
      'You analyse research documents in the sources/ directory. For every finding you report, include the source id, ' +
      'title, organisation, date and source type, and quote the supporting sentence. Flag outdated or low-quality sources. ' +
      'Never modify files.',
    tools: ROLE_TOOLS['source-analyst'],
    model: 'haiku',
  },
  'web-researcher': {
    description:
      'Searches the public web for recent studies not in the local corpus. Use only when the local sources ' +
      'leave a gap the coordinator has named explicitly.',
    prompt:
      'You find recent, credible studies on the web. Prefer peer-reviewed and government sources. ' +
      'Return each source with url, publisher, date and type, and say why you consider it credible.',
    tools: ROLE_TOOLS['web-researcher'],
    model: 'haiku',
  },
  'report-writer': {
    description:
      'Writes the final report file from findings the coordinator hands over. Use once research is complete; ' +
      'it does not research on its own.',
    prompt:
      'You write report.md from the findings you are given. Keep every citation. Do not add claims that are not in ' +
      'the findings. Separate well-established findings from contested ones.',
    tools: ROLE_TOOLS['report-writer'],
    model: 'inherit',
  },
};

/**
 * The coordinator runs as the main-thread agent (`Options.agent`), so its own `tools` list applies to the
 * main conversation: it can delegate and glance at the question, but it cannot search or write itself.
 */
export const COORDINATOR: AgentDefinition = {
  description: 'Plans research, delegates to specialists and assembles their results.',
  prompt:
    'You coordinate a research team. Break the question into subtasks and delegate each to the matching specialist: ' +
    'source-analyst for the local corpus, web-researcher only for named gaps, report-writer for the final file. ' +
    'Do not research or write files yourself.',
  tools: ['Agent', 'Read', 'Glob'],
};

export function buildOptions(cwd: string, model = modelFromEnv()): Options {
  const subagentTools = Object.values(ROLE_TOOLS).flat();
  return {
    cwd,
    model,
    agent: 'coordinator',
    agents: { coordinator: COORDINATOR, ...SUBAGENTS },
    // allowedTools only pre-approves; availability is decided by each definition's `tools`.
    allowedTools: [...new Set(['Agent', ...COORDINATOR.tools!, ...subagentTools])],
    // Headless: anything not pre-approved is denied instead of waiting for a prompt nobody answers.
    permissionMode: 'dontAsk',
    // Context scoping: don't pull the developer's user/project settings or CLAUDE.md into the run.
    settingSources: [],
    maxTurns: 20,
    maxBudgetUsd: 1,
  };
}

/** Tools a definition actually ends up with, given what the parent session offers. */
export function effectiveTools(def: Pick<AgentDefinition, 'tools' | 'disallowedTools'>, available: string[]): string[] {
  const base = def.tools ? def.tools.filter((t) => available.includes(t)) : available;
  return base.filter((t) => !(def.disallowedTools ?? []).includes(t));
}

/** The spawn tool is `Agent` in tool_use blocks today; older versions (before Claude Code v2.1.63) used `Task`. */
export function isSubagentCall(block: { type: string; name?: string }): boolean {
  return block.type === 'tool_use' && (block.name === 'Agent' || block.name === 'Task');
}

/** Subagent types the coordinator delegated to, read from the SDK message stream. */
export function listDelegations(messages: unknown[]): string[] {
  const types: string[] = [];
  for (const raw of messages) {
    const msg = raw as {
      type?: string;
      parent_tool_use_id?: string | null;
      message?: { content?: Array<{ type: string; name?: string; input?: { subagent_type?: string } }> };
    };
    if (msg.type !== 'assistant' || msg.parent_tool_use_id) continue; // only the coordinator's own turns
    for (const block of msg.message?.content ?? []) {
      if (isSubagentCall(block)) types.push(block.input?.subagent_type ?? 'general-purpose');
    }
  }
  return types;
}
