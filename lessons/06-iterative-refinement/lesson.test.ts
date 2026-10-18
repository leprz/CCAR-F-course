import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { FakeClient, reply, text } from '../../lib/testing/index.ts';
import { invoiceDoc, type InvoiceDoc, type InvoiceExtraction } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

const docs = ['INV-1', 'INV-2', 'INV-5', 'INV-8'].map(invoiceDoc);
const perfect = Object.fromEntries(docs.map((d) => [d.id, d.expected]));
/** A typical first-draft failure: currency guessed for EUR/PLN docs and the ambiguous one. */
const flawed = (d: InvoiceDoc): InvoiceExtraction =>
  ['INV-2', 'INV-8', 'INV-5'].includes(d.id) ? { ...d.expected, currency: 'USD' } : d.expected;

describe('TODO(1) evaluate', () => {
  it('scores a perfect run as 1 with no failures', () => {
    expect(lesson.evaluate(docs, perfect)).toEqual({ score: 1, failures: [] });
  });
  it('reports field-level failures with both values', () => {
    const { score, failures } = lesson.evaluate(docs, Object.fromEntries(docs.map((d) => [d.id, flawed(d)])));
    expect(failures).toContainEqual({ docId: 'INV-2', field: 'currency', expected: 'EUR', actual: 'USD' });
    expect(failures).toHaveLength(3);
    expect(score).toBeCloseTo(1 - 3 / (docs.length * 7), 5);
  });
  it('tolerates rounding noise on numbers', () => {
    const noisy = { ...perfect, 'INV-2': { ...invoiceDoc('INV-2').expected, total_amount: 1234.5600001 } };
    expect(lesson.evaluate(docs, noisy).failures).toEqual([]);
  });
});

describe('TODO(2) buildBatchedFeedback', () => {
  const failures = [
    { docId: 'INV-2', field: 'currency' as const, expected: 'EUR', actual: 'USD' },
    { docId: 'INV-8', field: 'currency' as const, expected: 'PLN', actual: 'USD' },
    { docId: 'INV-5', field: 'currency' as const, expected: null, actual: 'USD' },
    { docId: 'INV-5', field: 'issue_date' as const, expected: null, actual: '2026-02-03' },
  ];
  const feedback = lesson.buildBatchedFeedback(failures, docs);
  it('groups failures by field, one section each', () => {
    expect(feedback.match(/<field name="currency"/g)).toHaveLength(1);
    expect(feedback.match(/<field name="issue_date"/g)).toHaveLength(1);
    expect(feedback).toMatch(/failures="3"/);
  });
  it('lists every affected document', () => {
    for (const id of ['INV-2', 'INV-8', 'INV-5']) expect(feedback).toContain(id);
  });
  it('includes concrete input → expected → actual examples', () => {
    expect(feedback).toMatch(/<input>[\s\S]*Rechnungsnummer[\s\S]*<\/input>/);
    expect(feedback).toMatch(/<expected>"EUR"<\/expected>/);
    expect(feedback).toMatch(/<actual>"USD"<\/actual>/);
  });
  it('caps examples per field', () => {
    expect(feedback.match(/<example /g)).toHaveLength(3); // 2 for currency (cap) + 1 for issue_date
  });
});

describe('TODO(3) refinePrompt', () => {
  const revision = (prompt: string) =>
    reply([text(JSON.stringify({ revised_prompt: prompt, changes: [{ field: 'currency', change: 'never default to USD' }] }))]);

  it('makes ONE batched revision call per round and stops at the target', async () => {
    const client = new FakeClient([revision('v2: never default currency to USD')]);
    const extract = async (prompt: string, d: InvoiceDoc) => (prompt.startsWith('v2') ? d.expected : flawed(d));
    const { bestPrompt, history } = await lesson.refinePrompt(client, { initialPrompt: 'v1', docs, extract, maxRounds: 3 });

    expect(client.calls).toHaveLength(1);
    const sent = String(client.calls[0]!.messages[0]!.content);
    for (const id of ['INV-2', 'INV-8', 'INV-5']) expect(sent).toContain(id);
    expect(history.map((h) => h.score)).toEqual([expect.any(Number), 1]);
    expect(history[0]!.score).toBeLessThan(1);
    expect(bestPrompt).toBe('v2: never default currency to USD');
  });

  it('keeps the best prompt when a revision makes things worse', async () => {
    const client = new FakeClient([revision('v2-worse')]);
    const extract = async (prompt: string, d: InvoiceDoc) =>
      prompt === 'v2-worse' ? { ...d.expected, currency: 'other' as const, document_type: 'other' as const } : flawed(d);
    const { bestPrompt, history } = await lesson.refinePrompt(client, { initialPrompt: 'v1', docs, extract, maxRounds: 2 });
    expect(history).toHaveLength(2);
    expect(bestPrompt).toBe('v1');
  });

  it('stops after maxRounds evaluations', async () => {
    const client = new FakeClient([revision('v2'), revision('v3')]);
    const { history } = await lesson.refinePrompt(client, { initialPrompt: 'v1', docs, extract: async (_p, d) => flawed(d), maxRounds: 3 });
    expect(history).toHaveLength(3);
    expect(client.calls).toHaveLength(2);
  });
});
