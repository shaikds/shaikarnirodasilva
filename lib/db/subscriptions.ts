import { getDb } from './client';
import type { Subscription, CreateSubscriptionInput } from '@/types';

function nextMondayAt8(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

export function createSubscription(data: CreateSubscriptionInput): number | bigint {
  const result = getDb().prepare(`
    INSERT INTO subscriptions (customer_name, customer_email, product_id, quantity, prefer_group_buy, next_run, notes)
    VALUES (@customer_name, @customer_email, @product_id, @quantity, @prefer_group_buy, @next_run, @notes)
  `).run({
    ...data,
    prefer_group_buy: data.prefer_group_buy !== false ? 1 : 0,
    next_run: nextMondayAt8(),
    notes: data.notes ?? null,
  });
  return result.lastInsertRowid;
}

export function getSubscriptionsByEmail(email: string): Subscription[] {
  return getDb().prepare(`
    SELECT s.*, p.name as product_name, p.unit, p.price as current_price,
           p.image_url, p.category, sup.name as supplier_name
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    JOIN suppliers sup ON sup.id = p.supplier_id
    WHERE s.customer_email = ? AND s.active = 1
    ORDER BY s.created_at DESC
  `).all(email) as Subscription[];
}

export function getAllActiveSubscriptions(): Subscription[] {
  return getDb().prepare(`
    SELECT s.*, p.name as product_name, p.unit, p.price as current_price, p.stock_qty,
           p.category, sup.name as supplier_name
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    JOIN suppliers sup ON sup.id = p.supplier_id
    WHERE s.active = 1 AND s.next_run <= datetime('now')
    ORDER BY s.next_run ASC
  `).all() as Subscription[];
}

export function deactivateSubscription(id: number): void {
  getDb().prepare('UPDATE subscriptions SET active = 0 WHERE id = ?').run(id);
}

export function updateSubscriptionAfterRun(id: number, orderId: number | bigint): void {
  getDb().prepare(`
    UPDATE subscriptions
    SET last_run = datetime('now'), last_order_id = ?, next_run = ?
    WHERE id = ?
  `).run(orderId, nextMondayAt8(), id);
}

export function getSubscriptionRunLog() {
  return getDb().prepare(`
    SELECT s.id, s.customer_name, s.customer_email, s.quantity,
           p.name as product_name, p.unit,
           o.total_price, o.order_type, o.status, o.created_at as order_date
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN orders o ON o.id = s.last_order_id
    WHERE s.last_order_id IS NOT NULL
    ORDER BY o.created_at DESC
    LIMIT 50
  `).all();
}
