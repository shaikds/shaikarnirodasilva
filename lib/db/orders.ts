import { getDb } from './client';
import type { Order, CreateOrderInput } from '@/types';

export function createOrder(data: CreateOrderInput): number | bigint {
  const total_price = data.quantity * data.unit_price;
  const result = getDb().prepare(`
    INSERT INTO orders (customer_name, customer_email, product_id, quantity, unit_price, total_price, order_type, status, notes)
    VALUES (@customer_name, @customer_email, @product_id, @quantity, @unit_price, @total_price, 'individual', 'confirmed', @notes)
  `).run({ ...data, total_price, notes: data.notes ?? null });

  getDb()
    .prepare('UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?')
    .run(data.quantity, data.product_id);

  return result.lastInsertRowid;
}

export function getOrdersByEmail(email: string): Order[] {
  return getDb().prepare(`
    SELECT o.*, p.name as product_name, p.unit, s.name as supplier_name
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE o.customer_email = ?
    ORDER BY o.created_at DESC
  `).all(email) as Order[];
}

export function getOrderById(id: number): Order | undefined {
  return getDb().prepare(`
    SELECT o.*, p.name as product_name, p.unit, s.name as supplier_name, s.phone as supplier_phone
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE o.id = ?
  `).get(id) as Order | undefined;
}
