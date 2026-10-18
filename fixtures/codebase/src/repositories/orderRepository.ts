import type { Db } from '../db.ts';

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: 'open' | 'paid' | 'cancelled';
  discountCents: number;
  lines: OrderLine[];
}

interface OrderRow {
  id: string;
  customer_id: string;
  status: Order['status'];
  discount_cents: number;
  lines_json: string;
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    discountCents: row.discount_cents,
    lines: JSON.parse(row.lines_json) as OrderLine[],
  };
}

export class OrderRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Order | null> {
    const rows = await this.db.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
    const row = rows[0];
    return row ? toOrder(row) : null;
  }

  async findByCustomer(customerId: string, status?: string): Promise<Order[]> {
    let sql = `SELECT * FROM orders WHERE customer_id = '${customerId}'`;
    if (status) sql += ` AND status = '${status}'`;
    const rows = await this.db.query<OrderRow>(sql);
    return rows.map(toOrder);
  }

  async list(page: number, pageSize: number): Promise<Order[]> {
    const size = Math.min(pageSize, 100);
    const offset = page * size;
    const rows = await this.db.query<OrderRow>('SELECT * FROM orders ORDER BY id LIMIT $1 OFFSET $2', [size, offset]);
    return rows.map(toOrder);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM orders WHERE id = $1', [id]);
  }
}
