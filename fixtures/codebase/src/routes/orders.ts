import { ForbiddenError } from '../auth.ts';
import { httpError, ok, type Route } from '../http.ts';
import type { OrderService } from '../services/orderService.ts';

export function orderRoutes(service: OrderService): Route[] {
  return [
    {
      method: 'GET',
      path: '/orders/:id',
      handler: async (req) => {
        const order = await service.getOrder(req.params.id ?? '');
        if (!order) return { status: 404, body: { message: 'not found' } };
        return ok(order);
      },
    },
    {
      method: 'GET',
      path: '/orders',
      handler: async (req) => {
        try {
          const orders = await service.listForCustomer(req.principal, req.principal.customerId, req.query.status);
          return ok(orders);
        } catch (err) {
          if (err instanceof ForbiddenError) return httpError(403, 'forbidden', err.message);
          throw err;
        }
      },
    },
    {
      method: 'POST',
      path: '/orders/:id/delete',
      handler: async (req) => {
        await service.cancel(req.principal, req.params.id ?? '');
        return ok({ deleted: true });
      },
    },
    {
      method: 'POST',
      path: '/orders/:id/invoice',
      handler: async (req) => {
        try {
          return ok(await service.invoiceOrder(req.principal, req.params.id ?? ''), 201);
        } catch (err) {
          if (err instanceof ForbiddenError) return httpError(403, 'forbidden', err.message);
          return httpError(404, 'order_not_found', err instanceof Error ? err.message : String(err));
        }
      },
    },
  ];
}
