import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import {
  AMBIGUOUS_FIELD_NAMES,
  CURRENCIES,
  DOCUMENT_TYPES,
  type InvoiceDoc,
  type InvoiceExtraction,
} from '../../../fixtures/invoices/index.ts';

// The values your enums should allow (plus any escape values you decide are needed).
void AMBIGUOUS_FIELD_NAMES;
void CURRENCIES;
void DOCUMENT_TYPES;

/**
 * TODO(1): design the extraction schema (shape: InvoiceExtraction in fixtures/invoices/data.ts).
 *  - Several documents genuinely lack some values (no PO, no currency, no due date, contracts without totals).
 *    The model must be able to say "absent" without inventing anything.
 *  - Every key must be present in every response.
 *  - document_type and currency are closed lists, but real mail contains things outside them.
 *  - Add `ambiguous_fields` so the model can flag values that support two readings.
 *  - It must be accepted by structured outputs.
 */
export const INVOICE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    document_type: { type: 'string', enum: ['invoice', 'credit_note'] },
    vendor_name: { type: 'string', maxLength: 120 },
    invoice_number: { type: 'string' },
    po_number: { type: 'string' },
    issue_date: { type: 'string' },
    due_date: { type: 'string' },
    currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'PLN'] },
    total_amount: { type: 'number', minimum: 0 },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          unit_price: { type: 'number' },
          amount: { type: 'number' },
        },
      },
    },
    payment_terms: { type: 'string' },
  },
  required: ['document_type', 'vendor_name', 'total_amount'],
};

/** TODO(2a): tell the model what to do when a value is absent or ambiguous. */
export const SYSTEM_PROMPT = 'You extract data from accounts-payable documents. Return the result as JSON.';

/** TODO(2b): request schema-constrained output with structured outputs (`output_config`). */
export function buildExtractionRequest(doc: InvoiceDoc, model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `<document id="${doc.id}">\n${doc.text}\n</document>` },
      { role: 'assistant', content: '{' },
    ],
  };
}

export class ExtractionError extends Error {}

/**
 * TODO(3): the schema guarantee only holds for complete responses. Throw ExtractionError for responses
 * that may not match the schema, before parsing.
 */
export function parseExtraction(message: Message): InvoiceExtraction {
  const block = message.content[0];
  return JSON.parse(block?.type === 'text' ? block.text : '{}') as InvoiceExtraction;
}

export async function extractInvoice(client: MessageCreator, doc: InvoiceDoc, model?: string): Promise<InvoiceExtraction> {
  return parseExtraction(await client.messages.create(buildExtractionRequest(doc, model)));
}
