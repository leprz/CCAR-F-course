/** Support-desk scenario: a small online shop's customers, orders and inbound tickets (one file each in `tickets/`). */

import { readFileSync } from 'node:fs';

export interface Customer {
  id: string;
  email: string;
  name: string;
  tier: 'standard' | 'premium';
}

export interface Order {
  id: string;
  customerId: string;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  totalUsd: number;
  placedAt: string;
  carrier?: string;
  trackingNumber?: string;
}

export interface Ticket {
  id: string;
  fromEmail: string;
  subject: string;
  body: string;
}

export const customers: Customer[] = [
  { id: 'cus_001', email: 'ana.ortiz@example.com', name: 'Ana Ortiz', tier: 'premium' },
  { id: 'cus_002', email: 'ben.kowalski@example.com', name: 'Ben Kowalski', tier: 'standard' },
  { id: 'cus_003', email: 'chen.li@example.com', name: 'Chen Li', tier: 'standard' },
];

export const orders: Order[] = [
  { id: 'A1001', customerId: 'cus_001', status: 'delivered', totalUsd: 129.0, placedAt: '2026-09-02', carrier: 'UPS', trackingNumber: '1Z999AA10123456784' },
  { id: 'A1002', customerId: 'cus_001', status: 'shipped', totalUsd: 54.5, placedAt: '2026-10-10', carrier: 'DHL', trackingNumber: 'JD014600006281230' },
  { id: 'A1003', customerId: 'cus_001', status: 'processing', totalUsd: 18.0, placedAt: '2026-10-16' },
  { id: 'B2001', customerId: 'cus_002', status: 'delivered', totalUsd: 899.99, placedAt: '2026-08-21', carrier: 'FedEx', trackingNumber: '612999AA10NAUTICA' },
  { id: 'B2002', customerId: 'cus_002', status: 'refunded', totalUsd: 35.0, placedAt: '2026-09-30' },
  { id: 'C3001', customerId: 'cus_003', status: 'cancelled', totalUsd: 64.2, placedAt: '2026-10-01' },
];

/** Parse `tickets/<id>.txt`: "From:" and "Subject:" headers, a blank line, then the body. */
function readTicket(id: string): Ticket {
  const text = readFileSync(new URL(`./tickets/${id}.txt`, import.meta.url), 'utf8');
  const [headers = '', ...body] = text.split('\n\n');
  const header = (name: string) => new RegExp(`^${name}: (.*)$`, 'm').exec(headers)?.[1] ?? '';
  return { id, fromEmail: header('From'), subject: header('Subject'), body: body.join('\n\n').replace(/\n$/, '') };
}

export const tickets: Ticket[] = ['T-100', 'T-101', 'T-102', 'T-103'].map(readTicket);
