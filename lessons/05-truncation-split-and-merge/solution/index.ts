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

/** Split at the LINE ITEMS markers. The column-header line stays with the header, for context. */
export function splitDocument(text: string): DocumentParts {
  const lines = text.split('\n');
  const start = lines.indexOf('LINE ITEMS');
  const end = lines.indexOf('END LINE ITEMS');
  if (start < 0 || end < 0) return { header: text, itemLines: [], footer: '' };
  return {
    header: lines.slice(0, start + 2).join('\n'),
    itemLines: lines.slice(start + 2, end),
    footer: lines.slice(end + 1).join('\n'),
  };
}

export function chunkLines<T>(lines: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < lines.length; i += size) chunks.push(lines.slice(i, i + size));
  return chunks;
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

/** One scoped call: the shared header for context, plus only this chunk's lines. */
export function buildChunkRequest(
  parts: DocumentParts,
  chunk: string[],
  index: number,
  count: number,
  model = modelFromEnv(),
): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS_CEILING,
    system: 'Extract every line item you are given, and only those. Keep each line_no as printed.',
    output_config: { format: { type: 'json_schema', schema: LINE_ITEMS_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `<document_header>\n${parts.header}\n</document_header>\n<line_items part="${index + 1}/${count}">\n${chunk.join('\n')}\n</line_items>`,
      },
    ],
  };
}

/** Order by line_no and drop duplicates, so chunk boundaries and retried halves can overlap safely. */
export function mergeLineItems(chunks: NumberedLineItem[][]): LineItem[] {
  const byNo = new Map<number, NumberedLineItem>();
  for (const item of chunks.flat()) if (!byNo.has(item.line_no)) byNo.set(item.line_no, item);
  return [...byNo.values()].sort((a, b) => a.line_no - b.line_no).map(({ line_no: _n, ...item }) => item);
}

const textOf = (m: Message) => {
  const block = m.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
};

export class TruncationError extends Error {}

/** A truncated chunk is split in half and both halves retried, never retried with a bigger max_tokens. */
async function extractChunk(client: MessageCreator, parts: DocumentParts, chunk: string[], index: number, count: number, model?: string): Promise<NumberedLineItem[]> {
  const response = await client.messages.create(buildChunkRequest(parts, chunk, index, count, model));
  if (response.stop_reason !== 'max_tokens') {
    return (JSON.parse(textOf(response)) as { line_items: NumberedLineItem[] }).line_items;
  }
  if (chunk.length <= 1) throw new TruncationError('A single line does not fit the output budget');
  const mid = Math.ceil(chunk.length / 2);
  const halves = await Promise.all([
    extractChunk(client, parts, chunk.slice(0, mid), index, count, model),
    extractChunk(client, parts, chunk.slice(mid), index, count, model),
  ]);
  return halves.flat();
}

export interface LargeExtraction {
  extraction: InvoiceExtraction;
  issues: string[];
}

export async function extractLargeInvoice(
  client: MessageCreator,
  doc: InvoiceDoc,
  opts: { chunkSize?: number; model?: string } = {},
): Promise<LargeExtraction> {
  const parts = splitDocument(doc.text);
  const chunks = chunkLines(parts.itemLines, opts.chunkSize ?? 20);
  const [headerResponse, ...chunkResults] = await Promise.all([
    client.messages.create(buildHeaderRequest(parts, opts.model)),
    ...chunks.map((c, i) => extractChunk(client, parts, c, i, chunks.length, opts.model)),
  ]);
  const header = JSON.parse(textOf(headerResponse as Message)) as Omit<InvoiceExtraction, 'line_items'>;
  const line_items = mergeLineItems(chunkResults as NumberedLineItem[][]);
  const extraction: InvoiceExtraction = { ...header, line_items };

  const issues: string[] = [];
  if (line_items.length !== parts.itemLines.length) issues.push(`expected ${parts.itemLines.length} line items, merged ${line_items.length}`);
  const sum = Math.round(line_items.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  if (extraction.total_amount !== null && Math.abs(sum - extraction.total_amount) > 0.01) {
    issues.push(`total_amount ${extraction.total_amount} does not equal the merged line sum ${sum}`);
  }
  return { extraction, issues };
}
