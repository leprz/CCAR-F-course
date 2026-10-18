import type { Order } from '../repositories/orderRepository.ts';
import { roundHalfEven } from '../utils/money.ts';

export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/** Compute invoice totals for an order. */
export function computeTotals(order: Order, taxRate: number): InvoiceTotals {
  const subtotalCents = order.lines.reduce(
    (sum, line) => sum + roundHalfEven(line.quantity * line.unitPriceCents * (1 + taxRate)) / (1 + taxRate),
    0,
  );
  const taxCents = roundHalfEven(subtotalCents * taxRate);
  const discountCents = Math.min(order.discountCents, subtotalCents);
  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: subtotalCents + taxCents - discountCents,
  };
}

/** Split a total into `parts` instalments that sum exactly to the total. */
export function splitInstalments(totalCents: number, parts: number): number[] {
  const base = Math.floor(totalCents / parts);
  const result = Array.from({ length: parts }, () => base);
  result[parts - 1] = base + (totalCents - base * parts);
  return result;
}
