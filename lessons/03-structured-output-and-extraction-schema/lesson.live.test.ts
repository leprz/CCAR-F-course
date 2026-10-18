import { expect, it } from 'vitest';
import { createClient } from '../../lib/claude.ts';
import { loadLesson } from '../../lib/lesson.ts';
import { describeLive } from '../../lib/testing/index.ts';
import { invoiceDoc } from '../../fixtures/invoices/index.ts';

type Lesson = typeof import('./solution/index.ts');
const lesson = await loadLesson<Lesson>(import.meta.url);

describeLive('L03 live: structured outputs extraction', () => {
  it('EU invoice: normalised values, null PO', async () => {
    const result = await lesson.extractInvoice(createClient(), invoiceDoc('INV-2'));
    expect(result.po_number).toBeNull();
    expect(result.currency).toBe('EUR');
    expect(result.total_amount).toBeCloseTo(1234.56, 2);
    expect(result.issue_date).toBe('2026-03-04');
  });

  it('ambiguous invoice: no invented currency', async () => {
    const result = await lesson.extractInvoice(createClient(), invoiceDoc('INV-5'));
    expect(result.currency).toBeNull();
    expect(result.ambiguous_fields).toContain('currency');
  });

  it('contract: no invented invoice number or total', async () => {
    const result = await lesson.extractInvoice(createClient(), invoiceDoc('INV-6'));
    expect(result.document_type).toBe('contract');
    expect(result.invoice_number).toBeNull();
    expect(result.total_amount).toBeNull();
  });
});
