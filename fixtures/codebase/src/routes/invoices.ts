import { authorize, ForbiddenError } from '../auth.ts';
import { httpError, ok, type Route } from '../http.ts';
import type { InvoiceRepository } from '../repositories/invoiceRepository.ts';
import { formatUsd } from '../utils/money.ts';

export function invoiceRoutes(invoices: InvoiceRepository): Route[] {
  return [
    {
      method: 'GET',
      path: '/invoices/:id',
      handler: async (req) => {
        const invoice = await invoices.findById(req.params.id ?? '');
        if (!invoice) return httpError(404, 'invoice_not_found', `No invoice ${req.params.id}`);
        try {
          authorize(req.principal, invoice.customerId);
        } catch (err) {
          if (err instanceof ForbiddenError) return httpError(403, 'forbidden', err.message);
          throw err;
        }
        return ok({ ...invoice, totalFormatted: formatUsd(invoice.totalCents) });
      },
    },
  ];
}
