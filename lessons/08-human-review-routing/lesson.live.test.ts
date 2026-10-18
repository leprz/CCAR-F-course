import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { invoiceDoc } from '../../fixtures/invoices/index.ts';
import { extractWithConfidence } from './extract.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L08 live: route real extractions', () => {
  it('sends the ambiguous invoice and the contract to a human, with reasons', async () => {
    const client = createClient();
    const ambiguous = lesson.routeExtraction(await extractWithConfidence(client, invoiceDoc('INV-5')));
    const contract = lesson.routeExtraction(await extractWithConfidence(client, invoiceDoc('INV-6')));
    console.log(JSON.stringify({ ambiguous, contract }, null, 2));

    expect(ambiguous.route).toBe('human_review');
    expect(ambiguous.issues.some((i) => ['ambiguous', 'missing_required', 'low_confidence'].includes(i.code))).toBe(true);
    expect(contract.route).toBe('human_review');
    expect(contract.issues.map((i) => i.code)).toContain('not_invoice');
  });
});
