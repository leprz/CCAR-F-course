/**
 * A linter for Agent SDK multi-agent setups, plus the repaired configuration of the incident in README.md.
 *
 * Setups are typed loosely on purpose: real misconfigurations arrive as JSON/YAML or `as any` casts,
 * where TypeScript can't catch an unknown field or a misspelled tool name.
 */

export type FindingCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'AGENT_NOT_REGISTERED'
  | 'SPAWN_TOOL_UNAVAILABLE'
  | 'SPAWN_TOOL_NOT_APPROVED'
  | 'UNKNOWN_FIELD'
  | 'UNKNOWN_TOOL'
  | 'TOOL_CONFLICT'
  | 'VAGUE_DESCRIPTION';

export interface Finding {
  code: FindingCode;
  agent?: string;
  detail: string;
}

export interface SpawnSetup {
  /** What gets passed as `query({ options })`. */
  options: Record<string, unknown>;
  /** Agent names the coordinator's prompt expects to delegate to. */
  expectedAgents: string[];
  /** True when no human can answer a permission prompt (CI, a backend job). */
  headless: boolean;
}

/** Fields of `AgentDefinition` in @anthropic-ai/claude-agent-sdk 0.3.302. Anything else is silently ignored at runtime. */
export const AGENT_DEFINITION_FIELDS = [
  'description', 'tools', 'disallowedTools', 'prompt', 'model', 'mcpServers', 'criticalSystemReminder_EXPERIMENTAL',
  'skills', 'initialPrompt', 'maxTurns', 'autoCompactWindow', 'background', 'omitClaudeMd', 'memory', 'effort',
  'permissionMode', 'observer', 'observerMessage',
] as const;

/** Built-in tool names are case-sensitive. MCP tools follow `mcp__<server>__<tool>`. */
export const KNOWN_TOOLS = [
  'Agent', 'Task', 'Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch', 'TodoWrite', 'Skill',
] as const;

const SPAWN_TOOLS = ['Agent', 'Task'];

type Def = Record<string, unknown>;
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const agentsOf = (setup: SpawnSetup): Record<string, Def> => (setup.options.agents ?? {}) as Record<string, Def>;
const isKnownTool = (t: string) =>
  (KNOWN_TOOLS as readonly string[]).includes(t) || /^mcp__[\w-]+(__[\w-]+|__\*)?$/.test(t) || /^Agent\([\w\s,-]+\)$/.test(t);

type Rule = (setup: SpawnSetup) => Finding[];

/** Worked example: `description` and `prompt` are the two required AgentDefinition fields. */
export const missingRequiredField: Rule = (setup) =>
  Object.entries(agentsOf(setup)).flatMap(([agent, def]) =>
    (['description', 'prompt'] as const)
      .filter((f) => typeof def[f] !== 'string' || (def[f] as string).trim() === '')
      .map((f) => ({ code: 'MISSING_REQUIRED_FIELD' as const, agent, detail: `"${f}" is required` })),
  );

/** TODO(1): every name in `expectedAgents` must be registered in `options.agents`. One finding per missing agent. */
export const agentNotRegistered: Rule = (_setup) => [];

/**
 * TODO(2): the main thread must be able to use the spawn tool (`Agent`, legacy `Task`, or `Agent(type, ...)`).
 * Its tool set is the main-thread agent's `tools` when `options.agent` names one that lists tools, otherwise
 * `options.tools` when that is an array; with neither, the full default set (which includes Agent) applies.
 * `options.disallowedTools` containing the spawn tool also removes it. Report at most one finding.
 */
export const spawnToolUnavailable: Rule = (_setup) => [];

/**
 * TODO(3): in a headless run the spawn tool must be pre-approved: in `allowedTools`, or
 * `permissionMode: 'bypassPermissions'`, or a `canUseTool` callback. Interactive runs are fine.
 */
export const spawnToolNotApproved: Rule = (_setup) => [];

/** TODO(4): report every agent key that isn't in AGENT_DEFINITION_FIELDS (one finding per key). */
export const unknownField: Rule = (_setup) => [];

/** TODO(5): report tool names in `tools` / `disallowedTools` that don't resolve (use isKnownTool). */
export const unknownTool: Rule = (_setup) => [];

/** TODO(6): report tools listed in both `tools` and `disallowedTools`. */
export const toolConflict: Rule = (_setup) => [];

/**
 * TODO(7): flag descriptions Claude can't route on: fewer than 8 words, or no "use" / "when" / "for" cue.
 * Skip empty descriptions (MISSING_REQUIRED_FIELD already covers them).
 */
export const vagueDescription: Rule = (_setup) => [];

export const RULES: Rule[] = [
  missingRequiredField,
  agentNotRegistered,
  spawnToolUnavailable,
  spawnToolNotApproved,
  unknownField,
  unknownTool,
  toolConflict,
  vagueDescription,
];

export function diagnose(setup: SpawnSetup): Finding[] {
  return RULES.flatMap((rule) => rule(setup));
}

/** The configuration from the incident report. Do not edit: the tests diagnose it. */
export const BROKEN_SETUP: SpawnSetup = {
  headless: true,
  expectedAgents: ['source-analyst', 'web-researcher', 'report-writer', 'fact-checker'],
  options: {
    model: 'claude-haiku-5-5',
    tools: ['Read', 'Grep', 'Glob'],
    allowedTools: ['Read', 'Grep', 'Glob'],
    permissionMode: 'dontAsk',
    agents: {
      'source-analyst': {
        description: 'Analyst',
        prompt: 'Extract findings with source id, organisation, date and type from sources/.',
        tools: ['Read', 'grep', 'Glob'],
      },
      'report-writer': {
        description: 'Writes report.md from findings the coordinator hands over. Use once research is complete.',
        prompt: 'Write report.md from the findings you are given. Keep every citation.',
        allowedTools: ['Read', 'Write'],
      },
      'fact-checker': {
        description: 'Re-checks each claim in a draft against its cited source. Use after the report is drafted.',
        systemPrompt: 'Verify every claim against the cited source and list unsupported claims.',
        tools: ['Read', 'WebFetch'],
        disallowedTools: ['WebFetch'],
      },
    },
  },
};

/**
 * TODO(8): repair the incident. Replace this copy with a configuration where `diagnose` finds nothing, the
 * coordinator can delegate to all four expected agents, and each agent keeps least-privilege tools
 * (web-researcher: WebSearch + WebFetch; fact-checker: Read + WebFetch).
 */
export const FIXED_SETUP: SpawnSetup = structuredClone(BROKEN_SETUP);
