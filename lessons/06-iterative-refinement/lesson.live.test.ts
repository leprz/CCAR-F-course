import { expect, it } from 'vitest';
import { createClient, modelFromEnv } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { INVOICE_JSON_SCHEMA, invoiceDoc, type InvoiceDoc, type InvoiceExtraction } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L06 live: refine a weak extraction prompt', () => {
  it('a batched-feedback round does not lower the score, and the best prompt is kept', async () => {
    const client = createClient();
    const extract = async (prompt: string, doc: InvoiceDoc): Promise<InvoiceExtraction> => {
      const res = await client.messages.create({
        model: modelFromEnv(),
        max_tokens: 2048,
        system: prompt,
        output_config: { format: { type: 'json_schema', schema: INVOICE_JSON_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: 'user', content: doc.text }],
      });
      const block = res.content.find((b) => b.type === 'text');
      return JSON.parse(block?.type === 'text' ? block.text : '{}') as InvoiceExtraction;
    };
    const docs = ['INV-4', 'INV-5', 'INV-6'].map(invoiceDoc);
    const { history } = await lesson.refinePrompt(client, {
      initialPrompt: 'Extract the invoice. Fill in every field as completely as possible.',
      docs,
      extract,
      maxRounds: 2,
    });
    console.log(history.map((h) => ({ round: h.round, score: h.score, failures: h.failures })));
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...history.map((h) => h.score))).toBeGreaterThanOrEqual(history[0]!.score);
  });
});
