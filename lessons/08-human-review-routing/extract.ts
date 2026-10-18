import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { modelFromEnv, type MessageCreator } from '../../lib/claude.ts';
import { INVOICE_JSON_SCHEMA, KEY_FIELDS, type InvoiceDoc, type InvoiceExtraction } from '../../fixtures/invoices/index.ts';
import type { KeyField, ReviewCandidate } from './scenario.ts';

/**
 * Used by the live test: extraction plus a self-reported confidence per key field, in one structured-output
 * call. Structured outputs reject `minimum`/`maximum`, so the 0–1 range lives in the description.
 */
const CONFIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    extraction: INVOICE_JSON_SCHEMA,
    field_confidence: {
      type: 'object',
      additionalProperties: false,
      description:
        'For each field, how sure you are that the extracted value (including null) is exactly right, from 0 to 1. ' +
        'Use below 0.85 when the document is hard to read, the format is unusual, or you had to choose between readings.',
      properties: Object.fromEntries(KEY_FIELDS.map((f) => [f, { type: 'number' }])),
      required: [...KEY_FIELDS],
    },
  },
  required: ['extraction', 'field_confidence'],
};

export function buildConfidenceRequest(doc: InvoiceDoc, model = modelFromEnv()): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 3000,
    system:
      'You extract data from accounts-payable documents. Copy values only from the document. ' +
      'If a value is not in the document, return null. If it can be read more than one way, return null and list it in ambiguous_fields.',
    output_config: { format: { type: 'json_schema', schema: CONFIDENCE_SCHEMA } },
    messages: [{ role: 'user', content: `<document id="${doc.id}">\n${doc.text}\n</document>` }],
  };
}

export async function extractWithConfidence(client: MessageCreator, doc: InvoiceDoc): Promise<ReviewCandidate> {
  const message = await client.messages.create(buildConfidenceRequest(doc));
  const block = message.content.find((b) => b.type === 'text');
  if (message.stop_reason !== 'end_turn' || block?.type !== 'text') throw new Error(`Unusable response: ${message.stop_reason}`);
  const parsed = JSON.parse(block.text) as { extraction: InvoiceExtraction; field_confidence: Record<KeyField, number> };
  return { docId: doc.id, traits: doc.traits, extraction: parsed.extraction, fieldConfidence: parsed.field_confidence };
}
