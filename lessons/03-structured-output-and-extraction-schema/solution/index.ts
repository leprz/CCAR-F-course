import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../../lib/claude.ts';
import {
  AMBIGUOUS_FIELD_NAMES,
  CURRENCIES,
  DOCUMENT_TYPES,
  type InvoiceDoc,
  type InvoiceExtraction,
} from '../../../fixtures/invoices/index.ts';

const nullable = (type: 'string' | 'number', description: string) => ({ type: [type, 'null'], description });

/**
 * Required + nullable: every key must be present, and "not in the document" is an explicit null.
 * Enums carry an escape value ("other", null) so the model never has to force a wrong label.
 */
export const INVOICE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_type: {
      type: 'string',
      enum: [...DOCUMENT_TYPES],
      description: 'Use "other" for anything that is not an invoice, credit note or contract.',
    },
    vendor_name: nullable('string', 'Legal name of the issuer as printed.'),
    invoice_number: nullable('string', 'Document number exactly as printed. null if none.'),
    po_number: nullable('string', 'Customer purchase-order number. null if not shown; never reuse another number.'),
    issue_date: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD. null if absent or ambiguous.' },
    due_date: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD as printed. null if only relative terms.' },
    currency: {
      type: ['string', 'null'],
      enum: [...CURRENCIES, null],
      description: 'ISO 4217 code; "other" if not listed; null if the document states none.',
    },
    total_amount: nullable('number', "Document total, '.' decimal separator, negative for credit notes. null if none."),
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unit_price: { type: ['number', 'null'] },
          amount: { type: 'number' },
        },
        required: ['description', 'quantity', 'unit_price', 'amount'],
      },
    },
    payment_terms: nullable('string', 'Payment terms as printed, untranslated.'),
    ambiguous_fields: {
      type: 'array',
      items: { type: 'string', enum: [...AMBIGUOUS_FIELD_NAMES] },
      description: 'Fields whose printed value supports more than one reading.',
    },
  },
  required: [
    'document_type',
    'vendor_name',
    'invoice_number',
    'po_number',
    'issue_date',
    'due_date',
    'currency',
    'total_amount',
    'line_items',
    'payment_terms',
    'ambiguous_fields',
  ],
};

export const SYSTEM_PROMPT =
  'You extract data from accounts-payable documents. ' +
  'Copy values only from the document. If a value is not in the document, return null; never guess or derive it. ' +
  'If a value can be read more than one way, return null for it and list the field in ambiguous_fields.';

export function buildExtractionRequest(doc: InvoiceDoc, model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: INVOICE_SCHEMA } },
    messages: [{ role: 'user', content: `<document id="${doc.id}">\n${doc.text}\n</document>` }],
  };
}

export class ExtractionError extends Error {}

/**
 * The schema guarantee holds only for complete responses. A refusal or a max_tokens cut may not
 * match the schema, so check stop_reason before parsing.
 */
export function parseExtraction(message: Message): InvoiceExtraction {
  if (message.stop_reason === 'refusal') throw new ExtractionError('Model refused; output may not match the schema');
  if (message.stop_reason === 'max_tokens') throw new ExtractionError('Truncated at max_tokens; output may be incomplete');
  const block = message.content.find((b) => b.type === 'text');
  if (block?.type !== 'text') throw new ExtractionError('No text block in response');
  return JSON.parse(block.text) as InvoiceExtraction;
}

export async function extractInvoice(client: MessageCreator, doc: InvoiceDoc, model?: string): Promise<InvoiceExtraction> {
  return parseExtraction(await client.messages.create(buildExtractionRequest(doc, model)));
}
