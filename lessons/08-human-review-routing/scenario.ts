import { invoiceDoc, KEY_FIELDS, type InvoiceExtraction } from '../../fixtures/invoices/index.ts';

export type KeyField = (typeof KEY_FIELDS)[number];

/** One extraction coming out of the pipeline, with what we know about the document and the model's self-reported confidence. */
export interface ReviewCandidate {
  docId: string;
  /** Document characteristics from intake (OCR flags, document class): "handwritten", "credit-note", ... */
  traits: string[];
  extraction: InvoiceExtraction;
  /** Model-reported confidence per key field, 0–1. A field may be missing if the model didn't report it. */
  fieldConfidence: Partial<Record<KeyField, number>>;
}

const conf = (value: number, overrides: Partial<Record<KeyField, number>> = {}) =>
  ({ ...Object.fromEntries(KEY_FIELDS.map((f) => [f, value])), ...overrides }) as Record<KeyField, number>;

function candidate(
  docId: string,
  change: Partial<InvoiceExtraction>,
  fieldConfidence: Partial<Record<KeyField, number>>,
): ReviewCandidate {
  const doc = invoiceDoc(docId);
  return { docId, traits: doc.traits, extraction: { ...structuredClone(doc.expected), ...change }, fieldConfidence };
}

/**
 * Last night's extractions. Three contain real errors (compare with `invoiceDoc(id).expected`):
 *  - INV-2: EU decimal misread, total 123456 instead of 1234.56. The model is confident anyway.
 *  - INV-4: handwritten "5/3" read as May 3rd. The model is unsure.
 *  - INV-8: a PO number copied from another document. Confident, internally consistent, wrong.
 */
export const nightlyRun: ReviewCandidate[] = [
  candidate('INV-1', {}, conf(0.97)),
  candidate('INV-2', { total_amount: 123456 }, conf(0.95)),
  candidate('INV-3', {}, conf(0.95)),
  candidate('INV-4', { issue_date: '2026-05-03' }, conf(0.9, { issue_date: 0.55 })),
  candidate('INV-5', {}, conf(0.9, { issue_date: 0.4, currency: 0.5 })),
  candidate('INV-6', {}, conf(0.95)),
  candidate('INV-8', { po_number: '4500-1182' }, conf(0.92)),
];

/** Ground truth for the run, by document id. */
export const truth = new Map(nightlyRun.map((c) => [c.docId, invoiceDoc(c.docId).expected]));
