import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import { KEY_FIELDS, type InvoiceDoc, type InvoiceExtraction } from '../../../fixtures/invoices/index.ts';

export type KeyField = (typeof KEY_FIELDS)[number];

export interface Failure {
  docId: string;
  field: KeyField;
  expected: unknown;
  actual: unknown;
}

const same = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 0.01 : a === b;

/** Field-level scoring over KEY_FIELDS: a failure names the document, the field and both values. */
export function evaluate(docs: InvoiceDoc[], results: Record<string, InvoiceExtraction>): { score: number; failures: Failure[] } {
  const failures: Failure[] = [];
  let checked = 0;
  for (const doc of docs) {
    const actual = results[doc.id];
    for (const field of KEY_FIELDS) {
      checked++;
      const got = actual ? actual[field] : undefined;
      if (!same(doc.expected[field], got)) failures.push({ docId: doc.id, field, expected: doc.expected[field], actual: got });
    }
  }
  return { score: checked ? (checked - failures.length) / checked : 1, failures };
}

/**
 * ONE consolidated message for the whole round. Failures are grouped by field, so the reviser sees patterns
 * ("currency wrong on 2 docs") rather than isolated anecdotes. Each group carries up to `examplesPerField` concrete
 * input → expected → actual examples.
 */
export function buildBatchedFeedback(failures: Failure[], docs: InvoiceDoc[], examplesPerField = 2): string {
  const byField = new Map<KeyField, Failure[]>();
  for (const f of failures) byField.set(f.field, [...(byField.get(f.field) ?? []), f]);
  const docText = (id: string) => docs.find((d) => d.id === id)?.text ?? '';

  const sections = [...byField.entries()].map(([field, fs]) => {
    const examples = fs
      .slice(0, examplesPerField)
      .map(
        (f) =>
          `<example doc="${f.docId}">\n<input>\n${docText(f.docId)}\n</input>\n<expected>${JSON.stringify(f.expected)}</expected>\n<actual>${JSON.stringify(f.actual)}</actual>\n</example>`,
      )
      .join('\n');
    return `<field name="${field}" failures="${fs.length}" docs="${fs.map((f) => f.docId).join(',')}">\n${examples}\n</field>`;
  });

  return [
    `Evaluation round: ${failures.length} field failures across ${new Set(failures.map((f) => f.docId)).size} documents.`,
    'Fix the causes of ALL of them in one revision. Keep instructions that already work.',
    ...sections,
  ].join('\n\n');
}

export const REVISION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    revised_prompt: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { field: { type: 'string' }, change: { type: 'string' } },
        required: ['field', 'change'],
      },
    },
  },
  required: ['revised_prompt', 'changes'],
};

export function buildRevisionRequest(currentPrompt: string, feedback: string, model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 4096,
    system: 'You improve system prompts for a document-extraction model. Make targeted edits that address the reported failures.',
    output_config: { format: { type: 'json_schema', schema: REVISION_SCHEMA } },
    messages: [{ role: 'user', content: `<current_prompt>\n${currentPrompt}\n</current_prompt>\n\n<feedback>\n${feedback}\n</feedback>` }],
  };
}

export interface Round {
  round: number;
  prompt: string;
  score: number;
  failures: number;
}

export type Extractor = (prompt: string, doc: InvoiceDoc) => Promise<InvoiceExtraction>;

/**
 * Evaluate the whole set → one batched revision → re-evaluate the whole set. Stop when the target is reached
 * or rounds run out, and keep the best prompt, because a revision can make things worse.
 */
export async function refinePrompt(
  client: MessageCreator,
  opts: { initialPrompt: string; docs: InvoiceDoc[]; extract: Extractor; maxRounds?: number; targetScore?: number; model?: string },
): Promise<{ bestPrompt: string; history: Round[] }> {
  const maxRounds = opts.maxRounds ?? 3;
  const target = opts.targetScore ?? 1;
  const history: Round[] = [];
  let prompt = opts.initialPrompt;

  for (let round = 1; round <= maxRounds; round++) {
    const outputs = await Promise.all(opts.docs.map(async (d) => [d.id, await opts.extract(prompt, d)] as const));
    const { score, failures } = evaluate(opts.docs, Object.fromEntries(outputs));
    history.push({ round, prompt, score, failures: failures.length });
    if (score >= target || round === maxRounds) break;

    const response = await client.messages.create(buildRevisionRequest(prompt, buildBatchedFeedback(failures, opts.docs), opts.model));
    const block = response.content.find((b) => b.type === 'text');
    prompt = (JSON.parse(block?.type === 'text' ? block.text : '{}') as { revised_prompt: string }).revised_prompt;
  }

  const best = history.reduce((a, b) => (b.score > a.score ? b : a));
  return { bestPrompt: best.prompt, history };
}
