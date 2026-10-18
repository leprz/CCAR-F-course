import type { MessageCreateParamsNonStreaming, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import {
  CURRENCIES,
  INVOICE_JSON_SCHEMA,
  type InvoiceDoc,
  type InvoiceExtraction,
} from '../../../fixtures/invoices/index.ts';

/**
 * TODO(1): format normalisation rules. The inbox mixes US and European dates, '1.234,56' and '2 460,00' amounts,
 * currency symbols, and credit notes. Write one rule per value type that maps all of them to one canonical form
 * (dates YYYY-MM-DD, plain '.'-decimal numbers, negative credit notes, ISO currency codes), with concrete examples.
 */
export const NORMALIZATION_RULES: string[] = ['Use consistent formats.'];

export interface Scope {
  include: string[];
  exclude: { what: string; reason: string }[];
}

/**
 * TODO(2): explicit boundaries. Add exclusions (with a reason and the safe alternative output) for the categories
 * where this extractor is unreliable or out of scope:
 *  - bank details, handwritten annotations added after issue, due dates computed from relative terms,
 *    currency inferred from country/language, totals/line items for contracts and recurring fees.
 * buildSystemPrompt must render them in an <exclude> section next to an <include> section.
 */
export const SCOPE: Scope = {
  include: ['All information on the document.'],
  exclude: [],
};

export function buildSystemPrompt(scope: Scope, examples: InvoiceDoc[]): string {
  return [
    'You extract data from accounts-payable documents into the provided schema. Be thorough and fill every field.',
    NORMALIZATION_RULES.join('\n'),
    scope.include.join('\n'),
    examples.length ? formatExamples(examples) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * TODO(3): pick n few-shot examples that together cover as many distinct `traits` as possible.
 * Never include the document being extracted.
 */
export function selectFewShotExamples(pool: InvoiceDoc[], _target: InvoiceDoc, n: number): InvoiceDoc[] {
  return pool.slice(0, n);
}

/** TODO(3b): wrap the examples in <examples>/<example> tags, with the document and its expected JSON output. */
export function formatExamples(examples: InvoiceDoc[]): string {
  return examples.map((e) => `${e.text}\n=> ${JSON.stringify(e.expected)}`).join('\n\n');
}

/**
 * TODO(4): deterministic checks the schema cannot express. Return one human-readable issue per problem,
 * naming the field and the evidence:
 *  - issue_date / due_date not YYYY-MM-DD
 *  - currency not in CURRENCIES
 *  - total_amount not equal to the sum of line item amounts (±0.01), when both exist
 *  - a credit_note with a positive total
 */
export function validateExtraction(_x: InvoiceExtraction): string[] {
  void CURRENCIES;
  return [];
}

export function buildRequest(doc: InvoiceDoc, examples: InvoiceDoc[], model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(SCOPE, examples),
    output_config: { format: { type: 'json_schema', schema: INVOICE_JSON_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: `<document id="${doc.id}">\n${doc.text}\n</document>` }],
  };
}

export interface ValidatedExtraction {
  extraction: InvoiceExtraction;
  attempts: number;
  /** Issues still present after the last attempt. Non-empty means route to a human, not discard. */
  issues: string[];
}

/**
 * TODO(5): validate the extraction. If there are issues and attempts remain, append the model's answer and a user
 * message listing the SPECIFIC issues, then retry. After maxAttempts, return the last extraction with its remaining
 * issues instead of throwing.
 */
export async function extractWithValidation(
  client: MessageCreator,
  doc: InvoiceDoc,
  opts: { examples?: InvoiceDoc[]; maxAttempts?: number; model?: string } = {},
): Promise<ValidatedExtraction> {
  const request = buildRequest(doc, opts.examples ?? [], opts.model);
  const messages: MessageParam[] = [...request.messages];
  const response = await client.messages.create({ ...request, messages });
  const block = response.content.find((b) => b.type === 'text');
  const extraction = JSON.parse(block?.type === 'text' ? block.text : '{}') as InvoiceExtraction;
  return { extraction, attempts: 1, issues: [] };
}
