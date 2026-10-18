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

/**
 * TODO(1): field-level scoring. For every doc and every KEY_FIELD, compare expected vs actual
 * (numbers within ±0.01, everything else strict equality, a missing result counts as a failure).
 * score = correct checks / total checks. Each failure names the doc, the field and both values.
 */
export function evaluate(docs: InvoiceDoc[], results: Record<string, InvoiceExtraction>): { score: number; failures: Failure[] } {
  const wrong = docs.filter((d) => JSON.stringify(d.expected) !== JSON.stringify(results[d.id]));
  return {
    score: docs.length ? 1 - wrong.length / docs.length : 1,
    failures: wrong.map((d) => ({ docId: d.id, field: 'document_type', expected: 'correct', actual: 'wrong' })),
  };
}

/**
 * TODO(2): ONE consolidated feedback message for the whole round:
 *  - a summary line with the failure count
 *  - one `<field name="<field>" failures="<n>" docs="<id,id>">` section per failing field (never repeated)
 *  - inside, up to `examplesPerField` `<example doc="<id>">` blocks, each with the concrete `<input>` (document text),
 *    `<expected>` and `<actual>` values as JSON
 */
export function buildBatchedFeedback(failures: Failure[], _docs: InvoiceDoc[], _examplesPerField = 2): string {
  return `Some extractions were wrong (${failures.length} errors). Please improve the prompt.`;
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
 * TODO(3): restructure the loop:
 *  - each round: extract ALL docs with the current prompt, evaluate, record a Round in history
 *  - stop when score >= targetScore or after maxRounds evaluations
 *  - otherwise make exactly ONE revision call per round, with the batched feedback for all failures
 *  - return the BEST prompt seen (highest score; the earliest wins a tie), not simply the last one
 */
export async function refinePrompt(
  client: MessageCreator,
  opts: { initialPrompt: string; docs: InvoiceDoc[]; extract: Extractor; maxRounds?: number; targetScore?: number; model?: string },
): Promise<{ bestPrompt: string; history: Round[] }> {
  let prompt = opts.initialPrompt;
  const history: Round[] = [];
  for (const doc of opts.docs) {
    const result = await opts.extract(prompt, doc);
    const { score, failures } = evaluate([doc], { [doc.id]: result });
    history.push({ round: history.length + 1, prompt, score, failures: failures.length });
    for (const failure of failures) {
      const response = await client.messages.create(buildRevisionRequest(prompt, buildBatchedFeedback([failure], opts.docs), opts.model));
      const block = response.content.find((b) => b.type === 'text');
      prompt = (JSON.parse(block?.type === 'text' ? block.text : '{}') as { revised_prompt: string }).revised_prompt;
    }
  }
  return { bestPrompt: prompt, history };
}
