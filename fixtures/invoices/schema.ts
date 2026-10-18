import { AMBIGUOUS_FIELD_NAMES, CURRENCIES, DOCUMENT_TYPES } from './data.ts';

/**
 * Reference extraction schema, compatible with structured outputs (`output_config.format`) and strict tools.
 * Lessons after L03 use it. L03 asks you to build this yourself, so solve L03 before reading it.
 *
 * Design: every field is REQUIRED but nullable. The model must state "absent" explicitly (null)
 * instead of silently omitting a key, and it can never be forced to invent a value.
 */
const nullable = (type: 'string' | 'number', description: string) => ({ type: [type, 'null'], description });

export const INVOICE_JSON_SCHEMA = {
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
    po_number: nullable('string', 'Customer purchase-order number. null if the document does not show one; never reuse another number.'),
    issue_date: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD. null if absent or ambiguous.' },
    due_date: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD as printed. null if only relative terms are given.' },
    currency: {
      type: ['string', 'null'],
      enum: [...CURRENCIES, null],
      description: 'ISO 4217 code. "other" for a currency not in the list. null if the document does not state one.',
    },
    total_amount: nullable('number', "Document total, '.' decimal separator, negative for credit notes. null if no total is stated."),
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
} as const;
