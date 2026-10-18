import { authorize } from '../auth.ts';
import type { Principal } from '../http.ts';
import type { InvoiceRepository, Invoice } from '../repositories/invoiceRepository.ts';
import type { Order, OrderRepository } from '../repositories/orderRepository.ts';
import { computeTotals } from './billingService.ts';

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly invoices: InvoiceRepository,
    private readonly taxRate: number,
  ) {}

  async getOrder(id: string): Promise<Order | null> {
    return this.orders.findById(id);
  }

  async listForCustomer(principal: Principal, customerId: string, status?: string): Promise<Order[]> {
    authorize(principal, customerId);
    return this.orders.findByCustomer(customerId, status);
  }

  async invoiceOrder(principal: Principal, orderId: string): Promise<Invoice> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    authorize(principal, order.customerId);
    const totals = computeTotals(order, this.taxRate);
    const invoice: Invoice = {
      id: `inv_${order.id}`,
      orderId: order.id,
      customerId: order.customerId,
      totalCents: totals.totalCents,
      issuedAt: new Date().toISOString(),
    };
    await this.invoices.insert(invoice);
    return invoice;
  }

  async cancel(principal: Principal, orderId: string): Promise<void> {
    const order = await this.orders.findById(orderId);
    if (!order) return;
    authorize(principal, order.customerId);
    await this.orders.delete(orderId);
  }
}
