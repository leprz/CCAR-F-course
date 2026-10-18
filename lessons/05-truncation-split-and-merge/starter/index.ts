import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import {
  INVOICE_JSON_SCHEMA,
  type InvoiceDoc,
  type InvoiceExtraction,
  type LineItem,
} from '../../../fixtures/invoices/index.ts';

/** Keep every call's output budget modest: a big budget hides the real problem and gets slow and costly. */
export const MAX_TOKENS_CEILING = 4096;

const { line_items: _omit, ...headerProps } = INVOICE_JSON_SCHEMA.properties;

/** Everything except line items: small, fixed-size output. */
export const HEADER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: headerProps,
  required: INVOICE_JSON_SCHEMA.required.filter((k) => k !== 'line_items'),
};

export type NumberedLineItem = LineItem & { line_no: number };

export const LINE_ITEMS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          line_no: { type: 'integer', description: 'Line number as printed in the No. column.' },
          description: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit_price: { type: ['number', 'null'] },
          amount: { type: 'number' },
        },
        required: ['line_no', 'description', 'quantity', 'unit_price', 'amount'],
      },
    },
  },
  required: ['line_items'],
};

export interface DocumentParts {
  header: string;
  itemLines: string[];
  footer: string;
}

/**
 * TODO(1): split the document at the `LINE ITEMS` / `END LINE ITEMS` marker lines.
 * header = everything up to and including the column-header line after `LINE ITEMS`;
 * itemLines = one entry per printed line item; footer = everything after `END LINE ITEMS`.
 */
export function splitDocument(text: string): DocumentParts {
  return { header: text, itemLines: [], footer: '' };
}

/** TODO(1b): consecutive chunks of at most `size` elements. */
export function chunkLines<T>(lines: T[], _size: number): T[][] {
  return [lines];
}

export function buildHeaderRequest(parts: DocumentParts, model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 1024,
    system: 'Extract the document-level fields. Use null for anything not printed.',
    output_config: { format: { type: 'json_schema', schema: HEADER_SCHEMA } },
    messages: [{ role: 'user', content: `<document>\n${parts.header}\n…line items omitted…\n${parts.footer}\n</document>` }],
  };
}

/**
 * TODO(2): one SCOPED call per chunk. Send the shared header (for context) plus ONLY this chunk's lines,
 * request LINE_ITEMS_SCHEMA, and stay within MAX_TOKENS_CEILING.
 */
export function buildChunkRequest(
  parts: DocumentParts,
  chunk: string[],
  _index: number,
  _count: number,
  model = modelFromEnv(),
): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 16000,
    system: 'Extract all line items.',
    output_config: { format: { type: 'json_schema', schema: LINE_ITEMS_SCHEMA } },
    messages: [{ role: 'user', content: `${parts.header}\n${parts.itemLines.join('\n')}\n${chunk.join('\n')}\n${parts.footer}` }],
  };
}

/**
 * TODO(3): merge chunk results into one list ordered by line_no, with duplicates (same line_no) removed,
 * and line_no stripped from the output.
 */
export function mergeLineItems(chunks: NumberedLineItem[][]): LineItem[] {
  return chunks.flat().map(({ line_no: _n, ...item }) => item);
}

const textOf = (m: Message) => {
  const block = m.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
};

export class TruncationError extends Error {}

export interface LargeExtraction {
  extraction: InvoiceExtraction;
  issues: string[];
}

/**
 * TODO(4): replace "one giant call, and if it truncates, raise max_tokens" with:
 *  - a header call plus one call per chunk (they're independent, so run them concurrently)
 *  - a chunk that comes back with stop_reason "max_tokens" is split in half and both halves are retried
 *    (throw TruncationError if a single line still doesn't fit). Never go above MAX_TOKENS_CEILING.
 *  - merge the results, then report issues: a merged line count that differs from the printed lines,
 *    or a merged sum that differs from total_amount
 */
export async function extractLargeInvoice(
  client: MessageCreator,
  doc: InvoiceDoc,
  opts: { chunkSize?: number; model?: string } = {},
): Promise<LargeExtraction> {
  const request: MessageCreateParamsNonStreaming = {
    model: opts.model ?? modelFromEnv(),
    max_tokens: 2048,
    output_config: { format: { type: 'json_schema', schema: INVOICE_JSON_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: doc.text }],
  };
  let response = await client.messages.create(request);
  if (response.stop_reason === 'max_tokens') {
    response = await client.messages.create({ ...request, max_tokens: 64000 });
  }
  return { extraction: JSON.parse(textOf(response)) as InvoiceExtraction, issues: [] };
}
