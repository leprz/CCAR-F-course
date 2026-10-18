import { customers, orders, type Customer, type Order } from './data.ts';

/**
 * Fake support backend. Errors are written for the model, not for a stack trace: they say what went
 * wrong and what to do next, because they end up in `tool_result` blocks with `is_error: true`.
 */
export class BackendError extends Error {}

export async function lookupCustomer(email: string): Promise<Customer> {
  const customer = customers.find((c) => c.email.toLowerCase() === email.toLowerCase());
  if (!customer) {
    throw new BackendError(`No customer with email "${email}". Do not guess an id; triage the ticket as needing a human.`);
  }
  return customer;
}

export async function listOrders(customerId: string): Promise<Order[]> {
  if (!customers.some((c) => c.id === customerId)) {
    throw new BackendError(`Unknown customer_id "${customerId}". Call lookup_customer first and use the id it returns.`);
  }
  return orders.filter((o) => o.customerId === customerId);
}

export async function getOrder(orderId: string): Promise<Order> {
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new BackendError(`No order with id "${orderId}". Order ids look like "A1001".`);
  return order;
}
