import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { invoiceDoc, invoiceDocs } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L04 live: few-shot + normalisation + scope', () => {
  it.each(['INV-8', 'INV-4', 'INV-3'])('%s matches the ground truth on key fields', async (id) => {
    const doc = invoiceDoc(id);
    const examples = lesson.selectFewShotExamples(invoiceDocs, doc, 3);
    const { extraction, issues } = await lesson.extractWithValidation(createClient(), doc, { examples });
    expect(issues).toEqual([]);
    expect(extraction.issue_date).toBe(doc.expected.issue_date);
    expect(extraction.total_amount).toBeCloseTo(doc.expected.total_amount!, 2);
    expect(extraction.currency).toBe(doc.expected.currency);
  });

  it('INV-2: bank details never leak into any field', async () => {
    const doc = invoiceDoc('INV-2');
    const { extraction } = await lesson.extractWithValidation(createClient(), doc, {
      examples: lesson.selectFewShotExamples(invoiceDocs, doc, 3),
    });
    expect(JSON.stringify(extraction)).not.toMatch(/DE89|COBADEFF/);
  });
});
