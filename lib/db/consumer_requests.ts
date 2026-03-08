import { getDb } from './client';
import type { ConsumerRequest } from '@/types';

export function registerBuyingIntent(data: {
  customer_name: string;
  customer_email: string;
  city: string;
  neighborhood?: string;
  product_query: string;
  deadline: string;
}): number | bigint {
  const result = getDb().prepare(`
    INSERT INTO consumer_requests (customer_name, customer_email, city, neighborhood, product_query, deadline)
    VALUES (@customer_name, @customer_email, @city, @neighborhood, @product_query, @deadline)
  `).run({ neighborhood: null, ...data });
  return result.lastInsertRowid;
}

export function getRequestsByEmail(email: string): ConsumerRequest[] {
  return getDb()
    .prepare('SELECT * FROM consumer_requests WHERE customer_email = ? ORDER BY created_at DESC')
    .all(email) as ConsumerRequest[];
}

export function findMatchingRequests(city: string, productQuery: string): ConsumerRequest[] {
  const terms = productQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = getDb()
    .prepare(`SELECT * FROM consumer_requests WHERE city = ? AND status = 'searching'`)
    .all(city) as ConsumerRequest[];
  // simple in-memory relevance filter
  return rows.filter(r =>
    terms.some(t => r.product_query.toLowerCase().includes(t))
  );
}

export function updateRequestStatus(
  id: number,
  status: ConsumerRequest['status'],
  matchedGroupBuyId?: number,
): void {
  getDb().prepare(`
    UPDATE consumer_requests SET status = ?, matched_group_buy_id = ? WHERE id = ?
  `).run(status, matchedGroupBuyId ?? null, id);
}

export function getExpiredRequests(): ConsumerRequest[] {
  return getDb()
    .prepare(`SELECT * FROM consumer_requests WHERE status = 'searching' AND deadline < datetime('now')`)
    .all() as ConsumerRequest[];
}
