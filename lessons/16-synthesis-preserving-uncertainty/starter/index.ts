import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import type { ClaimId, ClaimStatus, ResearchSource, SourceFinding } from '../../../fixtures/research/index.ts';

export const CLAIMS: ClaimId[] = ['wellbeing', 'retention', 'output', 'on-call', 'collaboration'];
export const STATUSES: ClaimStatus[] = ['well-established', 'contested', 'insufficient-evidence'];

// ---------- output schema ----------

/**
 * TODO(1): this schema forces the model to collapse ten disagreeing sources into ONE conclusion with ONE confidence
 * number. Redesign it so each claim gets its own entry with: claim (enum CLAIMS), status (enum STATUSES), statement,
 * supporting_sources, conflicting_sources, and discounted_sources (items with source_id + reason). All required.
 * Keep the tool name. Top level: `claims` and `open_questions`, both required.
 */
export const SYNTHESIS_TOOL: Tool = {
  name: 'record_synthesis',
  description: 'Record the final answer to the research question.',
  input_schema: {
    type: 'object',
    properties: {
      conclusion: { type: 'string', description: 'One clear answer to the research question.' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      sources: { type: 'array', items: { type: 'string' } },
    },
    required: ['conclusion', 'confidence', 'sources'],
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

/**
 * TODO(2): every source counts the same today, so an undisclosed vendor "+40%" outweighs a randomised study.
 *  - start from TYPE_WEIGHT for the source type, and add TYPE_REASON (if any) to reasons
 *  - a source more than 10 years older than `asOf` gets weight × 0.25 and the reason `outdated (<year>)`
 *  - discounted = weight < DISCOUNT_BELOW
 */
export function weighSource(source: ResearchSource, _asOf = '2026-10-18'): SourceWeight {
  return { sourceId: source.id, weight: 1, discounted: false, reasons: [] };
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
 * TODO(3): today this is a majority vote. Most sources say "no change" on output, so output comes out
 * "well-established" even though a randomised study disagrees. Classify from the evidence instead:
 *  - use weighSource: discounted sources are set aside and listed in `discounted` (id → reasons joined by "; ")
 *  - fewer than two kept sources with weight >= STRONG_FROM → insufficient-evidence
 *  - kept sources pointing in more than one direction ("mixed" counts as its own direction) → contested
 *  - otherwise → well-established
 * The supporting/conflicting split below can stay as it is once `kept` holds only non-discounted sources.
 */
export function classifyClaim(claim: ClaimId, sources: ResearchSource[], _asOf?: string): Evidence {
  const kept: Array<{ id: string; weight: number; direction: SourceFinding['direction'] }> = [];
  const discounted: Record<string, string> = {};
  for (const s of sources) {
    const finding = s.findings.find((f) => f.claim === claim);
    if (finding) kept.push({ id: s.id, weight: 1, direction: finding.direction });
  }

  const counts = new Map<string, number>();
  for (const k of kept) counts.set(k.direction, (counts.get(k.direction) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  const status: ClaimStatus = top > kept.length / 2 ? 'well-established' : 'contested';

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

/**
 * TODO(4): this prompt asks for one confident answer and hands over bare excerpts, so the model can't tell a
 * randomised study from a vendor brochure, or 2009 from 2026. Build a prompt that includes:
 *  - every source's id with its date and type (and why it is discounted, if it is)
 *  - each source's findings, tagged with the claim and the source id
 *  - the evidence table (claim, status, supporting, conflicting, discounted)
 *  - rules: report every claim separately with its status; never merge or collapse conflicting evidence into one
 *    confident statement, and present both sides of a contested claim with their sources; cite source ids; never
 *    cite discounted sources as support; put unknowns under open_questions
 */
export function buildSynthesisPrompt(question: string, sources: ResearchSource[], _evidence: Evidence[], _asOf?: string): string {
  return [
    `Question: ${question}`,
    'Summarize the research below into one clear, confident answer.',
    ...sources.map((s) => s.excerpt),
  ].join('\n\n');
}

// ---------- checking the model's synthesis against the evidence ----------

export type IssueKind = 'missing-claim' | 'overclaimed' | 'status-mismatch' | 'conflict-dropped' | 'relies-on-discounted' | 'unknown-source';

export interface Issue {
  kind: IssueKind;
  claim: ClaimId | null;
  detail: string;
}

/**
 * TODO(5): check the model's synthesis against the evidence and return every problem (with a useful `detail`):
 *  - missing-claim: an evidence claim has no entry
 *  - overclaimed: the entry says well-established but the evidence says otherwise
 *  - status-mismatch: any other status difference
 *  - conflict-dropped: the evidence is contested but the entry lists no conflicting sources
 *  - relies-on-discounted: a discounted source is cited as support
 *  - unknown-source: any cited id (supporting, conflicting or discounted) that isn't in knownSourceIds
 */
export function validateSynthesis(_s: Synthesis, _evidence: Evidence[], _knownSourceIds: string[]): Issue[] {
  return [];
}

// ---------- synthesis with one evaluator-optimizer repair loop ----------

/**
 * TODO(6): one call, and whatever comes back is published. Turn it into an evaluator-optimizer loop:
 *  - force the record_synthesis tool, then validate its input against the evidence
 *  - if there are issues and repairs are left (maxRepairs, default 1): append the assistant turn and a user turn holding
 *    a tool_result for that tool_use with is_error: true, listing EVERY issue in one message, then call again
 *  - return the last synthesis with its remaining issues (don't throw when repairs run out)
 */
export async function synthesize(
  client: MessageCreator,
  question: string,
  sources: ResearchSource[],
  opts: { model?: string; asOf?: string; maxRepairs?: number } = {},
): Promise<{ synthesis: Synthesis; issues: Issue[]; evidence: Evidence[] }> {
  const evidence = classifyAll(sources, opts.asOf);
  const messages: MessageParam[] = [{ role: 'user', content: buildSynthesisPrompt(question, sources, evidence, opts.asOf) }];
  const response = await client.messages.create({
    model: opts.model ?? modelFromEnv(),
    max_tokens: 4096,
    tools: [SYNTHESIS_TOOL],
    tool_choice: { type: 'tool', name: SYNTHESIS_TOOL.name },
    messages,
  });
  const call = response.content.find((b) => b.type === 'tool_use');
  if (call?.type !== 'tool_use') throw new Error('record_synthesis was forced but not called');
  return { synthesis: call.input as Synthesis, issues: [], evidence };
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
