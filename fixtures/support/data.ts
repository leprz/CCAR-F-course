/** Support-desk scenario: a small online shop's customers, orders and inbound tickets. */

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

export const tickets: Ticket[] = [
  {
    id: 'T-100',
    fromEmail: 'ben.kowalski@example.com',
    subject: 'Charged twice??',
    body: 'Hi, I see two charges for my laptop order last month on my card statement. One of them needs to go back to me ASAP, this is a lot of money.',
  },
  {
    id: 'T-101',
    fromEmail: 'ana.ortiz@example.com',
    subject: 'Where are my orders',
    body: 'Can you tell me the status of orders A1001, A1002 and A1003? I need them before the weekend.',
  },
  {
    id: 'T-102',
    fromEmail: 'chen.li@example.com',
    subject: 'Password reset not arriving',
    body: "I've requested a password reset 3 times and no email arrives. Not urgent, just annoying.",
  },
  {
    id: 'T-103',
    fromEmail: 'unknown.person@example.com',
    subject: 'Refund',
    body: 'I want a refund for my order.',
  },
];
