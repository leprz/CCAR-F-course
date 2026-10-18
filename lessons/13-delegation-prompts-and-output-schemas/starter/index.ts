import type { ClaimId, SourceType } from '../../../fixtures/research/index.ts';

/**
 * The coordinator → subagent boundary. A subagent starts with a fresh context: the Agent tool's prompt
 * string is the ONLY thing it gets from the coordinator. What comes back must survive synthesis.
 */

export const CLAIM_IDS: ClaimId[] = ['wellbeing', 'retention', 'output', 'on-call', 'collaboration'];
export const SOURCE_TYPES: SourceType[] = ['peer-reviewed', 'government', 'survey', 'news', 'blog', 'vendor-whitepaper'];

export interface SourceRef {
  id: string;
  title: string;
  org: string;
  date: string;
  type: SourceType;
  url: string;
}

export interface PriorFinding {
  claim: ClaimId;
  statement: string;
  sourceIds: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DelegationTask {
  subagent: string;
  question: string;
  objective: string;
  successCriteria: string[];
  inScope: string[];
  /** Includes what other subagents are covering, so work isn't duplicated. */
  outOfScope: string[];
  priorFindings: PriorFinding[];
  sources: SourceRef[];
  constraints: string[];
}

// ---------- output schema ----------

/**
 * TODO(1): the synthesis step needs more than prose. Redesign the schema so that:
 *  - top level requires summary, findings, gaps and sources_consulted
 *  - each finding requires claim (enum CLAIM_IDS), statement, evidence_quote, source_id, source_date,
 *    source_type (enum SOURCE_TYPES), stance (supports | contradicts | mixed) and confidence (high | medium | low)
 *  - a finding may carry an optional metric that can be null
 *  - each sources_consulted entry says whether the source was used, and why (or why not)
 */
export const SUBAGENT_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['summary'],
  properties: {
    summary: { type: 'string', description: 'Summary of what you found.' },
    findings: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface ReportFinding {
  claim: ClaimId;
  statement: string;
  evidence_quote: string;
  source_id: string;
  source_date: string;
  source_type: SourceType;
  stance: 'supports' | 'contradicts' | 'mixed';
  confidence: 'high' | 'medium' | 'low';
  metric?: string | null;
}

export interface SubagentReport {
  summary: string;
  findings: ReportFinding[];
  gaps: string[];
  sources_consulted: Array<{ source_id: string; used: boolean; reason: string }>;
}

// ---------- delegation ----------

/**
 * TODO(2): pick the delegation style. Goal-oriented instructions let a subagent adapt when what it finds
 * changes the plan; procedural ones are for steps that are mandated and must be followed exactly.
 */
export function chooseDelegationStyle(_situation: {
  mandatedProcedure: boolean;
  intermediateFindingsChangePlan: boolean;
}): 'goal-oriented' | 'procedural' {
  return 'procedural';
}

/**
 * TODO(3): this prompt is a step list that hides the goal and drops almost everything the coordinator knows.
 * Rewrite it to be goal-oriented and self-contained:
 *  - objective, the research question for context, and success criteria
 *  - in-scope and out-of-scope (what other subagents cover)
 *  - every prior finding with its claim, statement, source ids and confidence
 *  - every source with id, title, org, date, type and url
 *  - constraints
 *  - the report format: the JSON schema (in a ```json block), plus a request to report gaps and discounted sources
 * No numbered step-by-step procedure.
 */
export function buildDelegationPrompt(task: DelegationTask): string {
  return [
    `Research this: ${task.objective}`,
    '1. Open each source file.',
    '2. Read it from top to bottom.',
    '3. Write down anything relevant.',
    `4. Summarise what you found about ${task.question}.`,
    `Sources: ${task.sources.map((s) => s.id).join(', ')}`,
  ].join('\n');
}

// ---------- parsing and hand-off ----------

export type ParseResult = { ok: true; report: SubagentReport } | { ok: false; errors: string[] };

/**
 * TODO(4): subagents wrap JSON in prose and ```json fences. Extract the (last) JSON object, then reject
 * reports synthesis can't trust: missing top-level keys, or findings with an unknown source_id, no source_date,
 * a bad source_type / claim / confidence, or no evidence_quote. Collect every error, never throw.
 */
export function parseSubagentReport(text: string, _knownSourceIds: string[]): ParseResult {
  return { ok: true, report: JSON.parse(text) as SubagentReport };
}

export interface SynthesisInput {
  byClaim: Record<string, ReportFinding[]>;
  gaps: string[];
  discounted: Array<{ source_id: string; reason: string }>;
}

/**
 * TODO(5): merge reports for the synthesis step without losing citations: every finding grouped by claim,
 * gaps de-duplicated, and every source a subagent did not use, with its reason.
 */
export function toSynthesisInput(reports: SubagentReport[]): SynthesisInput {
  return { byClaim: { all: [] }, gaps: [reports.map((r) => r.summary).join(' ')], discounted: [] };
}
