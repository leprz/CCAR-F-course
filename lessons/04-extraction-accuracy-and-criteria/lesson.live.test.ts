import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { invoiceDoc } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

// Scores only documents outside FEW_SHOT_EXAMPLES (INV-8, INV-3, INV-4); otherwise the model copies the answer.
describeLive('L04 live: few-shot + normalisation + scope', () => {
  it.each(['INV-2', 'INV-1'])('%s matches the ground truth on key fields', async (id) => {
    const doc = invoiceDoc(id);
    const { extraction, issues } = await lesson.extractWithValidation(createClient(), doc);
    expect(issues).toEqual([]);
    expect(extraction.issue_date).toBe(doc.expected.issue_date);
    expect(extraction.total_amount).toBeCloseTo(doc.expected.total_amount!, 2);
    expect(extraction.currency).toBe(doc.expected.currency);
  });

  it('INV-2: bank details never leak into any field (rule only; no example shows an IBAN)', async () => {
    const { extraction } = await lesson.extractWithValidation(createClient(), invoiceDoc('INV-2'));
    expect(JSON.stringify(extraction)).not.toMatch(/DE89|COBADEFF/);
  });

  it('INV-5: no currency inferred, relative due date not computed', async () => {
    const { extraction } = await lesson.extractWithValidation(createClient(), invoiceDoc('INV-5'));
    expect(extraction.currency).toBeNull();
    expect(extraction.due_date).toBeNull();
  });

  it('INV-6: contract gets no invented total', async () => {
    const { extraction } = await lesson.extractWithValidation(createClient(), invoiceDoc('INV-6'));
    expect(extraction.document_type).toBe('contract');
    expect(extraction.total_amount).toBeNull();
  });
});
