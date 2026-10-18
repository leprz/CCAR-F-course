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
 * Start simple and add structure only when it pays for itself (multi-agent runs cost ~15x the tokens of chat).
 * - Simple tasks and tightly coupled work stay in one agent.
 * - Steps that consume each other's output form a pipeline (with gates between stages).
 * - Known, independent subtasks fan out in parallel (lowest latency).
 * - When the subtasks can't be predicted up front, a coordinator decides them as findings arrive.
 */
export function choosePattern(r: Requirements): Pattern {
  if (r.complexity === 'simple' || r.heavySharedContext) return 'single-agent';
  if (r.stepsDependOnPreviousOutput) return 'sequential-pipeline';
  if (r.subtasksKnownUpfront) return 'parallel-fanout';
  return 'coordinator-worker';
}

export interface Effort {
  minSubagents: number;
  /** null = no fixed ceiling; cap it with your own budget. */
  maxSubagents: number | null;
  toolCallsPerAgent: [number, number] | null;
}

/** Effort-scaling rules from Anthropic's multi-agent research system write-up, embedded in the lead's prompt. */
export function effortFor(complexity: Requirements['complexity']): Effort {
  switch (complexity) {
    case 'simple':
      return { minSubagents: 1, maxSubagents: 1, toolCallsPerAgent: [3, 10] };
    case 'comparison':
      return { minSubagents: 2, maxSubagents: 4, toolCallsPerAgent: [10, 15] };
    case 'broad':
      return { minSubagents: 10, maxSubagents: null, toolCallsPerAgent: null };
  }
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

/** Claims whose sources point in more than one direction ("mixed" counts as a direction of its own). */
export function findConflicts(findings: WorkerFinding[]): ClaimId[] {
  const directions = new Map<ClaimId, Set<string>>();
  for (const f of findings) {
    if (!directions.has(f.claim)) directions.set(f.claim, new Set());
    directions.get(f.claim)!.add(f.direction);
  }
  return CLAIM_ORDER.filter((c) => (directions.get(c)?.size ?? 0) > 1);
}

/**
 * Plan the next round from what the last rounds found:
 * - leads to claims nobody has surveyed yet → a survey for each
 * - claims whose evidence conflicts → one targeted follow-up naming the sources that disagree
 * Nothing is planned twice.
 */
export function nextTasks(results: WorkerResult[], planned: Set<string>): Subtask[] {
  const findings = results.flatMap((r) => r.findings);
  const next: Subtask[] = [];
  const add = (t: Subtask) => {
    if (planned.has(t.id) || next.some((n) => n.id === t.id)) return;
    next.push(t);
  };

  const leadClaims = new Set(results.flatMap((r) => r.leads.map((l) => l.claim)));
  for (const claim of CLAIM_ORDER) if (leadClaims.has(claim)) add(survey(claim));

  for (const claim of findConflicts(findings)) {
    const ids = [...new Set(findings.filter((f) => f.claim === claim).map((f) => f.sourceId))].sort(bySourceId);
    add({
      id: `follow-up:${claim}`,
      kind: 'follow-up',
      claim,
      objective: `Sources disagree on ${claim}. Explain why (method, population, date, intervention) and say which evidence is stronger.`,
      sourceIds: ids,
    });
  }
  return next;
}

const bySourceId = (a: string, b: string) => Number(a.slice(1)) - Number(b.slice(1));

export interface ResearchRun {
  rounds: Subtask[][];
  results: WorkerResult[];
  /** Tasks that were planned but not run because a budget ran out. Reported, never silently dropped. */
  unexplored: Subtask[];
  stoppedBy: 'no-new-tasks' | 'max-rounds' | 'max-tasks';
}

/**
 * Coordinator loop: run each round's tasks in parallel, then let the findings decide the next round.
 * Budgets bound cost; whatever they cut off is reported as unexplored so synthesis can mention the gap.
 */
export async function runResearch(
  worker: Worker,
  opts: { maxRounds?: number; maxTasks?: number } = {},
): Promise<ResearchRun> {
  const maxRounds = opts.maxRounds ?? 4;
  const maxTasks = opts.maxTasks ?? 20;
  const rounds: Subtask[][] = [];
  const results: WorkerResult[] = [];
  const planned = new Set<string>();
  let queue = initialPlan();
  let executed = 0;

  while (queue.length > 0) {
    if (rounds.length >= maxRounds) return { rounds, results, unexplored: queue, stoppedBy: 'max-rounds' };
    const room = maxTasks - executed;
    if (room <= 0) return { rounds, results, unexplored: queue, stoppedBy: 'max-tasks' };

    const round = queue.slice(0, room);
    const overflow = queue.slice(room);
    round.forEach((t) => planned.add(t.id));
    rounds.push(round);
    results.push(...(await Promise.all(round.map((t) => worker(t)))));
    executed += round.length;

    if (overflow.length) return { rounds, results, unexplored: overflow, stoppedBy: 'max-tasks' };
    queue = nextTasks(results, planned);
  }
  return { rounds, results, unexplored: [], stoppedBy: 'no-new-tasks' };
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
