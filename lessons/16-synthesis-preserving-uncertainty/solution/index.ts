import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import type { ClaimId, ClaimStatus, ResearchSource, SourceFinding } from '../../../fixtures/research/index.ts';

export const CLAIMS: ClaimId[] = ['wellbeing', 'retention', 'output', 'on-call', 'collaboration'];
export const STATUSES: ClaimStatus[] = ['well-established', 'contested', 'insufficient-evidence'];

// ---------- output schema ----------

/**
 * One entry per claim, each with its own status and its own citations. Disagreement has somewhere to go
 * (conflicting_sources), and so do weak sources (discounted_sources + reason). Nothing forces a single verdict.
 */
export const SYNTHESIS_TOOL: Tool = {
  name: 'record_synthesis',
  description:
    'Record the research synthesis. One entry per claim. Contested claims list the sources on each side. ' +
    'Discounted sources are listed with the reason and never cited as support.',
  input_schema: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string', enum: CLAIMS },
            status: { type: 'string', enum: STATUSES },
            statement: {
              type: 'string',
              description: 'What the evidence says, with source ids inline. For contested claims, state both sides.',
            },
            supporting_sources: { type: 'array', items: { type: 'string', pattern: '^S\\d+$' } },
            conflicting_sources: { type: 'array', items: { type: 'string', pattern: '^S\\d+$' } },
            discounted_sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: { source_id: { type: 'string', pattern: '^S\\d+$' }, reason: { type: 'string' } },
                required: ['source_id', 'reason'],
              },
            },
          },
          required: ['claim', 'status', 'statement', 'supporting_sources', 'conflicting_sources', 'discounted_sources'],
        },
      },
      open_questions: { type: 'array', items: { type: 'string' }, description: 'What the evidence cannot answer yet.' },
    },
    required: ['claims', 'open_questions'],
  },
};

export interface ClaimSynthesis {
  claim: ClaimId;
  status: ClaimStatus;
  statement: string;
  supporting_sources: string[];
  conflicting_sources: string[];
  discounted_sources: Array<{ source_id: string; reason: string }>;
}

export interface Synthesis {
  claims: ClaimSynthesis[];
  open_questions: string[];
}

// ---------- source quality ----------

export interface SourceWeight {
  sourceId: string;
  weight: number;
  discounted: boolean;
  reasons: string[];
}

const TYPE_WEIGHT: Record<ResearchSource['type'], number> = {
  'peer-reviewed': 1,
  government: 1,
  survey: 0.6,
  news: 0.4,
  blog: 0.15,
  'vendor-whitepaper': 0.1,
};

const TYPE_REASON: Partial<Record<ResearchSource['type'], string>> = {
  blog: 'anecdotal blog post',
  'vendor-whitepaper': 'vendor marketing; methodology not disclosed',
};

export const DISCOUNT_BELOW = 0.3;
export const STRONG_FROM = 0.8;

/** Weight by evidence type, penalise sources older than ten years, and discount anything below the threshold. */
export function weighSource(source: ResearchSource, asOf = '2026-10-18'): SourceWeight {
  let weight = TYPE_WEIGHT[source.type];
  const reasons: string[] = [];
  if (TYPE_REASON[source.type]) reasons.push(TYPE_REASON[source.type]!);
  const ageYears = (Date.parse(asOf) - Date.parse(source.date)) / (365.25 * 24 * 3600 * 1000);
  if (ageYears > 10) {
    weight *= 0.25;
    reasons.push(`outdated (${source.date.slice(0, 4)})`);
  }
  return { sourceId: source.id, weight, discounted: weight < DISCOUNT_BELOW, reasons };
}

// ---------- evidence per claim ----------

export interface Evidence {
  claim: ClaimId;
  status: ClaimStatus;
  supporting: string[];
  conflicting: string[];
  /** source id → reason */
  discounted: Record<string, string>;
}

/**
 * Classify a claim from the evidence, not from a vote:
 * - discounted sources are set aside (and named), never counted
 * - fewer than two strong sources → insufficient-evidence
 * - kept sources pointing in more than one direction → contested (a "mixed" finding is a direction of its own)
 * - otherwise → well-established
 */
export function classifyClaim(claim: ClaimId, sources: ResearchSource[], asOf?: string): Evidence {
  const kept: Array<{ id: string; weight: number; direction: SourceFinding['direction'] }> = [];
  const discounted: Record<string, string> = {};
  for (const s of sources) {
    const finding = s.findings.find((f) => f.claim === claim);
    if (!finding) continue;
    const w = weighSource(s, asOf);
    if (w.discounted) discounted[s.id] = w.reasons.join('; ');
    else kept.push({ id: s.id, weight: w.weight, direction: finding.direction });
  }

  const strong = kept.filter((k) => k.weight >= STRONG_FROM).length;
  const directions = new Set(kept.map((k) => k.direction));
  const status: ClaimStatus = strong < 2 ? 'insufficient-evidence' : directions.size > 1 ? 'contested' : 'well-established';

  const weightBy = new Map<string, number>();
  for (const k of kept) if (k.direction !== 'mixed') weightBy.set(k.direction, (weightBy.get(k.direction) ?? 0) + k.weight);
  const dominant = [...weightBy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    claim,
    status,
    supporting: kept.filter((k) => k.direction === dominant).map((k) => k.id),
    conflicting: kept.filter((k) => k.direction !== dominant).map((k) => k.id),
    discounted,
  };
}

export function classifyAll(sources: ResearchSource[], asOf?: string): Evidence[] {
  return CLAIMS.map((c) => classifyClaim(c, sources, asOf)).filter(
    (e) => e.supporting.length + e.conflicting.length + Object.keys(e.discounted).length > 0,
  );
}

// ---------- the synthesis prompt ----------

export function buildSynthesisPrompt(question: string, sources: ResearchSource[], evidence: Evidence[], asOf?: string): string {
  const sourceRows = sources.map((s) => {
    const w = weighSource(s, asOf);
    return `| ${s.id} | ${s.title} | ${s.org} | ${s.date} | ${s.type} | ${s.basis} | ${w.discounted ? 'DISCOUNTED: ' + w.reasons.join('; ') : w.reasons.join('; ') || '–'} |`;
  });
  const findingLines = sources.flatMap((s) =>
    s.findings.map((f) => `- [${f.claim}] ${s.id} (${s.date}, ${s.type}): ${f.direction}. ${f.statement}${f.metric ? ` [${f.metric}]` : ''}`),
  );
  const evidenceRows = evidence.map(
    (e) =>
      `| ${e.claim} | ${e.status} | ${e.supporting.join(', ') || '–'} | ${e.conflicting.join(', ') || '–'} | ${
        Object.entries(e.discounted).map(([id, why]) => `${id} (${why})`).join('; ') || '–'
      } |`,
  );
  return [
    `# Research question`,
    question,
    '',
    `# Sources`,
    '| id | title | org | date | type | basis | quality |',
    '|---|---|---|---|---|---|---|',
    ...sourceRows,
    '',
    `# Findings reported by the sources`,
    ...findingLines,
    '',
    `# Evidence assessment (computed from source quality and agreement)`,
    '| claim | status | supporting | conflicting | discounted |',
    '|---|---|---|---|---|',
    ...evidenceRows,
    '',
    `# How to write the synthesis`,
    '- Report every claim separately, with the status from the evidence assessment. Do not upgrade a status.',
    '- Never merge or collapse conflicting evidence into one confident statement. For a contested claim, present both sides, each with its sources.',
    '- Cite source ids for every statement. Keep numbers exactly as reported and attribute them, e.g. "S9: deliverables −9%".',
    '- Discounted sources are never cited as support. List them under discounted_sources with the reason.',
    '- Put what the evidence cannot answer under open_questions.',
    'Call record_synthesis with the result.',
  ].join('\n');
}

// ---------- checking the model's synthesis against the evidence ----------

export type IssueKind = 'missing-claim' | 'overclaimed' | 'status-mismatch' | 'conflict-dropped' | 'relies-on-discounted' | 'unknown-source';

export interface Issue {
  kind: IssueKind;
  claim: ClaimId | null;
  detail: string;
}

export function validateSynthesis(s: Synthesis, evidence: Evidence[], knownSourceIds: string[]): Issue[] {
  const issues: Issue[] = [];
  const known = new Set(knownSourceIds);
  for (const e of evidence) {
    const c = s.claims.find((x) => x.claim === e.claim);
    if (!c) {
      issues.push({ kind: 'missing-claim', claim: e.claim, detail: `No entry for "${e.claim}".` });
      continue;
    }
    if (c.status !== e.status) {
      issues.push({
        kind: c.status === 'well-established' ? 'overclaimed' : 'status-mismatch',
        claim: e.claim,
        detail: `"${e.claim}" is ${e.status} on the evidence, not ${c.status}.`,
      });
    }
    if (e.status === 'contested' && c.conflicting_sources.length === 0) {
      issues.push({ kind: 'conflict-dropped', claim: e.claim, detail: `"${e.claim}" is contested but no conflicting sources are listed (expected ${e.conflicting.join(', ')}).` });
    }
    for (const id of c.supporting_sources) {
      if (e.discounted[id]) issues.push({ kind: 'relies-on-discounted', claim: e.claim, detail: `${id} is discounted (${e.discounted[id]}) but cited as support for "${e.claim}".` });
    }
  }
  for (const c of s.claims) {
    for (const id of [...c.supporting_sources, ...c.conflicting_sources, ...c.discounted_sources.map((d) => d.source_id)]) {
      if (!known.has(id)) issues.push({ kind: 'unknown-source', claim: c.claim, detail: `${id} is not one of the sources.` });
    }
  }
  return issues;
}

// ---------- synthesis with one evaluator-optimizer repair loop ----------

export async function synthesize(
  client: MessageCreator,
  question: string,
  sources: ResearchSource[],
  opts: { model?: string; asOf?: string; maxRepairs?: number } = {},
): Promise<{ synthesis: Synthesis; issues: Issue[]; evidence: Evidence[] }> {
  const evidence = classifyAll(sources, opts.asOf);
  const known = sources.map((s) => s.id);
  const messages: MessageParam[] = [{ role: 'user', content: buildSynthesisPrompt(question, sources, evidence, opts.asOf) }];

  for (let attempt = 0; ; attempt++) {
    const response = await client.messages.create({
      model: opts.model ?? modelFromEnv(),
      max_tokens: 4096,
      system: 'You synthesise research findings for decision makers. Accuracy about uncertainty matters more than a crisp answer.',
      tools: [SYNTHESIS_TOOL],
      tool_choice: { type: 'tool', name: SYNTHESIS_TOOL.name },
      messages,
    });
    const call = response.content.find((b) => b.type === 'tool_use');
    if (call?.type !== 'tool_use') throw new Error('record_synthesis was forced but not called');
    const synthesis = call.input as Synthesis;
    const issues = validateSynthesis(synthesis, evidence, known);
    if (issues.length === 0 || attempt >= (opts.maxRepairs ?? 1)) return { synthesis, issues, evidence };

    // Send the problems back as a failed tool result: specific, batched feedback for one consolidated revision.
    messages.push(
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: `The synthesis does not match the evidence:\n${issues.map((i) => `- [${i.kind}] ${i.detail}`).join('\n')}\nCall record_synthesis again with every issue fixed.`,
          },
        ],
      },
    );
  }
}

export function renderReport(s: Synthesis): string {
  const section = (status: ClaimStatus, title: string) => {
    const items = s.claims.filter((c) => c.status === status);
    if (!items.length) return [];
    return [
      `## ${title}`,
      ...items.map((c) => {
        const cites = [...c.supporting_sources, ...c.conflicting_sources].map((id) => `[${id}]`).join('');
        return `- **${c.claim}**: ${c.statement} ${cites}`;
      }),
      '',
    ];
  };
  return [
    ...section('well-established', 'Well-established'),
    ...section('contested', 'Contested'),
    ...section('insufficient-evidence', 'Insufficient evidence'),
    ...(s.open_questions.length ? ['## Open questions', ...s.open_questions.map((q) => `- ${q}`)] : []),
  ].join('\n');
}
