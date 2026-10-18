import Anthropic from '@anthropic-ai/sdk';
import { expect, it } from 'vitest';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { invoiceDoc } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

// Batches usually finish within an hour but may take up to 24h. This test waits at most 20 minutes,
// then cancels the batch and skips rather than failing on queue time.
const BUDGET_MS = 20 * 60_000;

describeLive('L07 live: a two-request Message Batch', () => {
  it(
    'creates a batch, polls it to "ended" and maps results back by custom_id',
    async (ctx) => {
      const client = new Anthropic();
      const docs = [invoiceDoc('INV-1'), invoiceDoc('INV-3')];
      const batch = await client.messages.batches.create({ requests: lesson.buildBatchRequests(docs) });

      try {
        await lesson.waitForBatch(client, batch.id, { intervalMs: 30_000, timeoutMs: BUDGET_MS });
      } catch {
        await client.messages.batches.cancel(batch.id);
        ctx.skip(`batch ${batch.id} still processing after ${BUDGET_MS / 60_000} minutes; canceled`);
      }

      const { succeeded, failed } = await lesson.collectResults(client, batch.id);
      console.log('batch', batch.id, { succeeded: [...succeeded.keys()], failed });
      expect(succeeded.get('INV-1')?.total_amount).toBe(1245.5);
      expect(succeeded.get('INV-3')?.document_type).toBe('credit_note');
    },
    BUDGET_MS + 60_000,
  );
});
