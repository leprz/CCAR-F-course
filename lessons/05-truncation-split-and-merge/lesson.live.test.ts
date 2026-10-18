import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive, RecordingClient } from '../../lib/testing/index.ts';
import { largeInvoice } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L05 live: split, extract concurrently, merge', () => {
  it('extracts all 60 line items with a bounded output budget per call', async () => {
    const client = new RecordingClient(createClient());
    const { extraction, issues } = await lesson.extractLargeInvoice(client, largeInvoice, { chunkSize: 20 });
    console.log('calls', client.calls.length, 'issues', issues);
    expect(extraction.line_items).toHaveLength(60);
    expect(issues).toEqual([]);
    expect(extraction.total_amount).toBeCloseTo(largeInvoice.expected.total_amount!, 2);
    for (const call of client.calls) expect(call.max_tokens).toBeLessThanOrEqual(lesson.MAX_TOKENS_CEILING);
  });
});
