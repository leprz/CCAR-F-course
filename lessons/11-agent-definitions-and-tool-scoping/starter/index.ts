import type { AgentDefinition, Options } from '@anthropic-ai/claude-agent-sdk';
import { modelFromEnv } from '../../../lib/claude.ts';

/**
 * A research system on the Agent SDK: a coordinator that should only plan and delegate, and three
 * specialists. Right now every agent can do everything.
 */

export const SUBAGENT_NAMES = ['source-analyst', 'web-researcher', 'report-writer'] as const;
export type SubagentName = (typeof SUBAGENT_NAMES)[number];

/**
 * TODO(1): least privilege per role.
 *  - source-analyst reads local files: it must not write, run commands or go to the web
 *  - web-researcher only searches and fetches web pages
 *  - report-writer reads findings and writes the report file, nothing else
 *  - no specialist may spawn further agents
 * Then use these lists in SUBAGENTS below.
 */
export const ROLE_TOOLS: Record<SubagentName, string[]> = {
  'source-analyst': [],
  'web-researcher': [],
  'report-writer': [],
};

/**
 * TODO(2): the coordinator picks a subagent from its description alone. Say what each one does and
 * when to use it ("Use for…" / "Use when…"), in a sentence or two each.
 */
export const SUBAGENTS: Record<SubagentName, AgentDefinition> = {
  'source-analyst': {
    description: 'Analyst.',
    prompt:
      'You analyse research documents in the sources/ directory. For every finding you report, include the source id, ' +
      'title, organisation, date and source type, and quote the supporting sentence. Never modify files.',
    model: 'haiku',
  },
  'web-researcher': {
    description: 'Researcher.',
    prompt: 'You find recent, credible studies on the web. Return each source with url, publisher, date and type.',
    model: 'haiku',
  },
  'report-writer': {
    description: 'Writer.',
    prompt: 'You write report.md from the findings you are given. Keep every citation.',
    model: 'inherit',
  },
};

/**
 * TODO(3): the coordinator runs as the main-thread agent. Give it only what it needs to plan and
 * delegate (the spawn tool, plus reading/listing files). It must not search, fetch or write by itself.
 */
export const COORDINATOR: AgentDefinition = {
  description: 'Plans research, delegates to specialists and assembles their results.',
  prompt:
    'You coordinate a research team. Break the question into subtasks and delegate each to the matching specialist. ' +
    'Do not research or write files yourself.',
};

/**
 * TODO(4): wire it together for a headless run.
 *  - run COORDINATOR as the main thread and register every agent
 *  - pre-approve the spawn tool and every tool the agents use (allowedTools only approves; it does not grant)
 *  - unapproved tools must be denied, not prompted (nobody is there to answer)
 *  - don't load the developer's user/project settings or CLAUDE.md
 *  - cap turns and spend
 */
export function buildOptions(cwd: string, model = modelFromEnv()): Options {
  return {
    cwd,
    model,
    allowedTools: ['Read'],
  };
}

/**
 * TODO(5): what a definition really gets. Omitting `tools` means "inherit everything available",
 * listing tools means "only these (if available)", and disallowedTools always removes.
 */
export function effectiveTools(def: Pick<AgentDefinition, 'tools' | 'disallowedTools'>, _available: string[]): string[] {
  return def.tools ?? [];
}

/**
 * TODO(6): detect delegation in the message stream. Check what the spawn tool is called in tool_use
 * blocks in the current SDK, and keep older transcripts working too.
 */
export function isSubagentCall(block: { type: string; name?: string }): boolean {
  return block.type === 'tool_use' && block.name === 'Task';
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
