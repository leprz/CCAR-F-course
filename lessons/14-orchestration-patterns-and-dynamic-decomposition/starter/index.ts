import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import { sourceToMarkdown, sources, type ClaimId, type SourceFinding } from '../../../fixtures/research/index.ts';

// ---------- choosing a structure ----------

export type Pattern = 'single-agent' | 'sequential-pipeline' | 'parallel-fanout' | 'coordinator-worker';

export interface Requirements {
  /** simple = one fact; comparison = a few known items; broad = open-ended research */
  complexity: 'simple' | 'comparison' | 'broad';
  /** Can you list every subtask before you start? */
  subtasksKnownUpfront: boolean;
  /** Does each step consume the previous step's output? */
  stepsDependOnPreviousOutput: boolean;
  /** Do workers need to share a lot of context or edit the same artefacts (e.g. most coding)? */
  heavySharedContext: boolean;
}

/**
 * TODO(1): pick the simplest structure that meets the requirements. Today every task gets a coordinator with
 * workers, including one-fact lookups and tightly coupled edits, and multi-agent runs cost ~15x the tokens of chat.
 * Consider: simple or tightly coupled work, steps that consume each other's output, known independent subtasks,
 * and subtasks you can't predict up front.
 */
export function choosePattern(_r: Requirements): Pattern {
  return 'coordinator-worker';
}

export interface Effort {
  minSubagents: number;
  /** null = no fixed ceiling; cap it with your own budget. */
  maxSubagents: number | null;
  toolCallsPerAgent: [number, number] | null;
}

/**
 * TODO(2): scale effort with complexity, using the rules from Anthropic's multi-agent research system write-up
 * (see the lecture): simple fact-finding, direct comparisons, complex research.
 */
export function effortFor(_complexity: Requirements['complexity']): Effort {
  return { minSubagents: 5, maxSubagents: 5, toolCallsPerAgent: [10, 10] };
}

// ---------- coordinator-worker with dynamic decomposition ----------

export interface Subtask {
  id: string;
  kind: 'survey' | 'follow-up';
  claim: ClaimId;
  objective: string;
  /** For follow-ups: the sources that disagree. */
  sourceIds: string[];
}

export interface WorkerFinding {
  claim: ClaimId;
  sourceId: string;
  direction: SourceFinding['direction'];
  statement: string;
}

export interface WorkerResult {
  taskId: string;
  findings: WorkerFinding[];
  /** Other claims the worker noticed in its sources and that nobody asked about yet. */
  leads: Array<{ claim: ClaimId; reason: string }>;
  /** Follow-ups only: how the disagreement was resolved (or why it can't be). */
  resolution?: string;
}

export type Worker = (task: Subtask) => Promise<WorkerResult>;

export const CLAIM_ORDER: ClaimId[] = ['wellbeing', 'retention', 'output', 'on-call', 'collaboration'];

/** The coordinator's first, deliberately broad plan: the obvious angles only. Everything else is discovered. */
export function initialPlan(): Subtask[] {
  return (['wellbeing', 'output', 'retention'] as ClaimId[]).map((claim) => survey(claim));
}

function survey(claim: ClaimId): Subtask {
  return { id: `survey:${claim}`, kind: 'survey', claim, objective: `Survey all evidence on ${claim}.`, sourceIds: [] };
}

/**
 * TODO(4): return the claims (in CLAIM_ORDER) whose findings point in more than one direction.
 * "mixed" counts as a direction of its own.
 */
export function findConflicts(_findings: WorkerFinding[]): ClaimId[] {
  return [];
}

/**
 * TODO(5): plan the next round from what the previous rounds found, instead of stopping after the fixed plan:
 *  - a lead to a claim nobody has surveyed yet → a survey task for it (use survey(claim))
 *  - a claim whose evidence conflicts → ONE follow-up task with id `follow-up:<claim>`, kind 'follow-up',
 *    and sourceIds = every source with a finding on that claim, sorted S1, S2, …, S10
 *  - never plan a task id that is already in `planned` (or twice in the same round)
 *  - order: surveys first, then follow-ups, each in CLAIM_ORDER
 */
export function nextTasks(_results: WorkerResult[], _planned: Set<string>): Subtask[] {
  return [];
}

export interface ResearchRun {
  rounds: Subtask[][];
  results: WorkerResult[];
  /** Tasks that were planned but not run because a budget ran out. Reported, never silently dropped. */
  unexplored: Subtask[];
  stoppedBy: 'no-new-tasks' | 'max-rounds' | 'max-tasks';
}

/**
 * TODO(3): the tasks in one round are independent, so run them concurrently.
 * TODO(6): keep going round after round with nextTasks(results, planned) until nothing new is planned, within
 * budgets: stop before a round that would exceed maxRounds (default 4), never run more than maxTasks tasks in total
 * (default 20), and return whatever the budget cut off as `unexplored` with the matching `stoppedBy`.
 */
export async function runResearch(
  worker: Worker,
  _opts: { maxRounds?: number; maxTasks?: number } = {},
): Promise<ResearchRun> {
  const round = initialPlan();
  const results: WorkerResult[] = [];
  for (const task of round) results.push(await worker(task));
  return { rounds: [round], results, unexplored: [], stoppedBy: 'no-new-tasks' };
}

// ---------- a real worker (used by the live test) ----------

const REPORT_TOOL: Tool = {
  name: 'report_findings',
  description:
    'Report what the given sources say. One finding per (source, claim) pair you can support from the text. ' +
    'List other claims you noticed in these sources under leads. For follow-ups, explain the disagreement in resolution.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string', enum: CLAIM_ORDER },
            sourceId: { type: 'string', pattern: '^S\\d+$' },
            direction: { type: 'string', enum: ['improves', 'worsens', 'no-change', 'mixed'] },
            statement: { type: 'string' },
          },
          required: ['claim', 'sourceId', 'direction', 'statement'],
        },
      },
      leads: {
        type: 'array',
        items: {
          type: 'object',
          properties: { claim: { type: 'string', enum: CLAIM_ORDER }, reason: { type: 'string' } },
          required: ['claim', 'reason'],
        },
      },
      resolution: { type: ['string', 'null'] },
    },
    required: ['findings', 'leads'],
  },
};

/** One stateless worker call per subtask. The prompt is self-contained: workers share no context. */
export function makeClaudeWorker(client: MessageCreator, model = modelFromEnv()): Worker {
  return async (task) => {
    const docs = (task.sourceIds.length ? sources.filter((s) => task.sourceIds.includes(s.id)) : sources)
      .map(sourceToMarkdown)
      .join('\n---\n');
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: 'You are a research worker. Use only the provided sources. Claims: ' + CLAIM_ORDER.join(', ') + '.',
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report_findings' },
      messages: [{ role: 'user', content: `Task (${task.kind}, claim "${task.claim}"): ${task.objective}\n\n${docs}` }],
    });
    const call = response.content.find((b) => b.type === 'tool_use');
    if (call?.type !== 'tool_use') throw new Error(`worker for ${task.id} did not report`);
    const input = call.input as Omit<WorkerResult, 'taskId'>;
    return {
      taskId: task.id,
      findings: input.findings ?? [],
      leads: input.leads ?? [],
      ...(input.resolution ? { resolution: input.resolution } : {}),
    };
  };
}
