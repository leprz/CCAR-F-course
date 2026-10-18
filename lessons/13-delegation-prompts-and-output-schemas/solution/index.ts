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

export const SUBAGENT_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['summary', 'findings', 'gaps', 'sources_consulted'],
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: 'At most 3 sentences of prose for a human reader. Never the only place a fact appears.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'statement', 'evidence_quote', 'source_id', 'source_date', 'source_type', 'stance', 'confidence'],
        additionalProperties: false,
        properties: {
          claim: { type: 'string', enum: CLAIM_IDS },
          statement: { type: 'string', description: 'One finding, in your words.' },
          evidence_quote: { type: 'string', description: 'Verbatim sentence from the source that supports the statement.' },
          source_id: { type: 'string', pattern: '^S\\d+$' },
          source_date: { type: 'string', description: 'ISO date of the source, copied from its metadata.' },
          source_type: { type: 'string', enum: SOURCE_TYPES },
          stance: { type: 'string', enum: ['supports', 'contradicts', 'mixed'], description: 'Relative to the claim improving.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          metric: { type: ['string', 'null'], description: 'Quantitative result exactly as reported, or null.' },
        },
      },
    },
    gaps: { type: 'array', items: { type: 'string' }, description: 'What you looked for and could not find.' },
    sources_consulted: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source_id', 'used', 'reason'],
        properties: {
          source_id: { type: 'string' },
          used: { type: 'boolean' },
          reason: { type: 'string', description: 'Why it was used or discounted (e.g. outdated, vendor claim).' },
        },
      },
    },
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
 * Goal-oriented by default: state the outcome and its boundaries, let the subagent adapt its path, and
 * buy back visibility with the required report (what was searched, gaps, sources discounted).
 * Procedural only when a mandated sequence must be followed exactly (audit, regulation).
 */
export function chooseDelegationStyle(situation: {
  mandatedProcedure: boolean;
  intermediateFindingsChangePlan: boolean;
}): 'goal-oriented' | 'procedural' {
  if (situation.mandatedProcedure) return 'procedural';
  return 'goal-oriented';
}

export function buildDelegationPrompt(task: DelegationTask): string {
  const lines: string[] = [];
  lines.push(`## Objective`, task.objective, '');
  lines.push(`## Context`, `This is part of answering: "${task.question}"`, '');
  lines.push(`## Success criteria`, ...task.successCriteria.map((c) => `- ${c}`), '');
  lines.push(`## Scope`, ...task.inScope.map((s) => `- In scope: ${s}`), ...task.outOfScope.map((s) => `- Out of scope: ${s}`), '');
  lines.push(`## What we already know`);
  lines.push(
    ...(task.priorFindings.length
      ? task.priorFindings.map((f) => `- [${f.claim}] ${f.statement} (sources: ${f.sourceIds.join(', ')}; confidence: ${f.confidence})`)
      : ['- Nothing yet.']),
    '',
  );
  lines.push(`## Sources to examine`, '| id | title | org | date | type | url |', '|---|---|---|---|---|---|');
  lines.push(...task.sources.map((s) => `| ${s.id} | ${s.title} | ${s.org} | ${s.date} | ${s.type} | ${s.url} |`), '');
  if (task.constraints.length) lines.push(`## Constraints`, ...task.constraints.map((c) => `- ${c}`), '');
  lines.push(
    `## Report format`,
    'You decide how to investigate. Report back as a single JSON object matching this schema, in a ```json fenced block, ' +
      'and nothing after it. Every finding must carry its source id, date and type. List what you searched for but could not find ' +
      'under "gaps", and say why you discounted any source in "sources_consulted".',
    '```json',
    JSON.stringify(SUBAGENT_OUTPUT_SCHEMA, null, 2),
    '```',
  );
  return lines.join('\n');
}

// ---------- parsing and hand-off ----------

export type ParseResult = { ok: true; report: SubagentReport } | { ok: false; errors: string[] };

function extractJson(text: string): string {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].at(-1);
  if (fenced?.[1]) return fenced[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/** Validate the parts synthesis depends on; reject rather than guess. */
export function parseSubagentReport(text: string, knownSourceIds: string[]): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch (err) {
    return { ok: false, errors: [`not valid JSON: ${(err as Error).message}`] };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, errors: ['report is not a JSON object'] };
  const errors: string[] = [];
  const r = data as Partial<SubagentReport>;
  for (const key of SUBAGENT_OUTPUT_SCHEMA.required) if (!(key in (r as object))) errors.push(`missing "${key}"`);
  (r.findings ?? []).forEach((f, i) => {
    if (!knownSourceIds.includes(f.source_id)) errors.push(`findings[${i}]: unknown source_id "${f.source_id}"`);
    if (!f.source_date) errors.push(`findings[${i}]: missing source_date`);
    if (!SOURCE_TYPES.includes(f.source_type)) errors.push(`findings[${i}]: bad source_type "${f.source_type}"`);
    if (!CLAIM_IDS.includes(f.claim)) errors.push(`findings[${i}]: bad claim "${f.claim}"`);
    if (!['high', 'medium', 'low'].includes(f.confidence)) errors.push(`findings[${i}]: bad confidence "${f.confidence}"`);
    if (!f.evidence_quote) errors.push(`findings[${i}]: missing evidence_quote`);
  });
  return errors.length ? { ok: false, errors } : { ok: true, report: r as SubagentReport };
}

export interface SynthesisInput {
  byClaim: Record<string, ReportFinding[]>;
  gaps: string[];
  discounted: Array<{ source_id: string; reason: string }>;
}

/** Merge reports for the synthesis step: keep every finding with its citation, grouped by claim. */
export function toSynthesisInput(reports: SubagentReport[]): SynthesisInput {
  const byClaim: Record<string, ReportFinding[]> = {};
  for (const f of reports.flatMap((r) => r.findings)) (byClaim[f.claim] ??= []).push(f);
  return {
    byClaim,
    gaps: [...new Set(reports.flatMap((r) => r.gaps))],
    discounted: reports.flatMap((r) => r.sources_consulted.filter((s) => !s.used).map(({ source_id, reason }) => ({ source_id, reason }))),
  };
}
