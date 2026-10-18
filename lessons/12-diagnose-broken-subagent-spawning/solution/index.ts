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

export const agentNotRegistered: Rule = (setup) =>
  setup.expectedAgents
    .filter((name) => !(name in agentsOf(setup)))
    .map((agent) => ({
      code: 'AGENT_NOT_REGISTERED',
      agent,
      detail: `"${agent}" is expected but not in options.agents; Claude can only spawn registered (or built-in) agents`,
    }));

/** The main thread needs the spawn tool in its tool set: the main-thread agent's `tools`, else `options.tools`. */
export const spawnToolUnavailable: Rule = (setup) => {
  const { options } = setup;
  const mainAgent = typeof options.agent === 'string' ? agentsOf(setup)[options.agent] : undefined;
  const restricting = mainAgent?.tools !== undefined ? asList(mainAgent.tools) : Array.isArray(options.tools) ? asList(options.tools) : undefined;
  const removed = asList(options.disallowedTools).some((t) => SPAWN_TOOLS.includes(t));
  const missing = restricting !== undefined && !restricting.some((t) => SPAWN_TOOLS.includes(t) || t.startsWith('Agent('));
  return missing || removed
    ? [{ code: 'SPAWN_TOOL_UNAVAILABLE', detail: 'the coordinator has no Agent tool, so it cannot delegate and does the work itself' }]
    : [];
};

/** Headless runs need the spawn tool pre-approved; nobody is there to answer the permission prompt. */
export const spawnToolNotApproved: Rule = (setup) => {
  if (!setup.headless) return [];
  const { options } = setup;
  const approved =
    asList(options.allowedTools).some((t) => SPAWN_TOOLS.includes(t)) ||
    options.permissionMode === 'bypassPermissions' ||
    typeof options.canUseTool === 'function';
  return approved ? [] : [{ code: 'SPAWN_TOOL_NOT_APPROVED', detail: 'add "Agent" to allowedTools (or provide canUseTool)' }];
};

export const unknownField: Rule = (setup) =>
  Object.entries(agentsOf(setup)).flatMap(([agent, def]) =>
    Object.keys(def)
      .filter((k) => !(AGENT_DEFINITION_FIELDS as readonly string[]).includes(k))
      .map((k) => ({ code: 'UNKNOWN_FIELD' as const, agent, detail: `"${k}" is not an AgentDefinition field and is ignored` })),
  );

export const unknownTool: Rule = (setup) =>
  Object.entries(agentsOf(setup)).flatMap(([agent, def]) =>
    [...asList(def.tools), ...asList(def.disallowedTools)]
      .filter((t) => !isKnownTool(t))
      .map((t) => ({ code: 'UNKNOWN_TOOL' as const, agent, detail: `"${t}" does not resolve to a tool (names are case-sensitive)` })),
  );

export const toolConflict: Rule = (setup) =>
  Object.entries(agentsOf(setup)).flatMap(([agent, def]) =>
    asList(def.tools)
      .filter((t) => asList(def.disallowedTools).includes(t))
      .map((t) => ({ code: 'TOOL_CONFLICT' as const, agent, detail: `"${t}" is both allowed and disallowed; disallowedTools wins` })),
  );

/** Claude routes on the description: it needs enough words and a when-to-use cue. */
export const vagueDescription: Rule = (setup) =>
  Object.entries(agentsOf(setup)).flatMap(([agent, def]) => {
    const d = typeof def.description === 'string' ? def.description : '';
    if (d.trim() === '') return []; // reported as MISSING_REQUIRED_FIELD
    const tooShort = d.trim().split(/\s+/).length < 8;
    const noCue = !/\b(use|when|for)\b/i.test(d);
    return tooShort || noCue
      ? [{ code: 'VAGUE_DESCRIPTION' as const, agent, detail: 'say what the agent does and when to use it' }]
      : [];
  });

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

/** The repaired configuration: `diagnose(FIXED_SETUP)` returns no findings. */
export const FIXED_SETUP: SpawnSetup = {
  headless: true,
  expectedAgents: ['source-analyst', 'web-researcher', 'report-writer', 'fact-checker'],
  options: {
    model: 'claude-haiku-5-5',
    tools: ['Agent', 'Read', 'Grep', 'Glob', 'Write', 'WebSearch', 'WebFetch'],
    allowedTools: ['Agent', 'Read', 'Grep', 'Glob', 'Write', 'WebSearch', 'WebFetch'],
    permissionMode: 'dontAsk',
    agents: {
      'source-analyst': {
        description: 'Reads the local sources/ corpus and extracts findings with source metadata. Use for questions the corpus can answer.',
        prompt: 'Extract findings with source id, organisation, date and type from sources/.',
        tools: ['Read', 'Grep', 'Glob'],
      },
      'web-researcher': {
        description: 'Searches the web for recent credible studies. Use only for gaps the coordinator names explicitly.',
        prompt: 'Find recent, credible studies. Return url, publisher, date and type for each.',
        tools: ['WebSearch', 'WebFetch'],
      },
      'report-writer': {
        description: 'Writes report.md from findings the coordinator hands over. Use once research is complete.',
        prompt: 'Write report.md from the findings you are given. Keep every citation.',
        tools: ['Read', 'Write'],
      },
      'fact-checker': {
        description: 'Re-checks each claim in a draft against its cited source. Use after the report is drafted.',
        prompt: 'Verify every claim against the cited source and list unsupported claims.',
        tools: ['Read', 'WebFetch'],
      },
    },
  },
};
