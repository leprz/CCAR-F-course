import type { Db } from '../db.ts';

export interface Invoice {
  id: string;
  orderId: string;
  customerId: string;
  totalCents: number;
  issuedAt: string;
}

export class InvoiceRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Invoice | null> {
    const rows = await this.db.query<Invoice>(
      'SELECT id, order_id AS "orderId", customer_id AS "customerId", total_cents AS "totalCents", issued_at AS "issuedAt" FROM invoices WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async insert(invoice: Invoice): Promise<void> {
    await this.db.query(
      'INSERT INTO invoices (id, order_id, customer_id, total_cents, issued_at) VALUES ($1, $2, $3, $4, $5)',
      [invoice.id, invoice.orderId, invoice.customerId, invoice.totalCents, invoice.issuedAt],
    );
  }
}
