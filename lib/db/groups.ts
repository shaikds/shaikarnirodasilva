import { getDb } from './client';
import { getProductById } from './products';
import type { GroupBuy, JoinGroupBuyResult } from '@/types';

const GROUP_BUY_SELECT = `
  SELECT gb.*, p.name as product_name, p.image_url, p.unit, p.category,
         s.name as supplier_name, s.location as supplier_location,
         ROUND((gb.current_qty * 100.0 / gb.target_qty), 1) as progress_pct
  FROM group_buys gb
  JOIN products p ON p.id = gb.product_id
  JOIN suppliers s ON s.id = p.supplier_id
`;

export function getAllGroupBuys(status = 'active'): GroupBuy[] {
  return getDb()
    .prepare(`${GROUP_BUY_SELECT} WHERE gb.status = ? ORDER BY gb.deadline ASC`)
    .all(status) as GroupBuy[];
}

export function getGroupBuyById(id: number): GroupBuy | undefined {
  return getDb()
    .prepare(`${GROUP_BUY_SELECT} WHERE gb.id = ?`)
    .get(id) as GroupBuy | undefined;
}

export function createGroupBuy(data: {
  product_id: number;
  target_qty: number;
  regular_price: number;
  group_price: number;
  deadline: string;
  city?: string | null;
  cutoff_day?: number;
  team_min_qty?: number;
}): number | bigint {
  const result = getDb().prepare(`
    INSERT INTO group_buys (product_id, target_qty, regular_price, group_price, deadline, city, cutoff_day, team_min_qty)
    VALUES (@product_id, @target_qty, @regular_price, @group_price, @deadline, @city, @cutoff_day, @team_min_qty)
  `).run({ city: null, cutoff_day: 3, team_min_qty: 10, ...data });
  return result.lastInsertRowid;
}

export function getGroupBuysByCity(city: string): GroupBuy[] {
  return getDb()
    .prepare(`${GROUP_BUY_SELECT} WHERE gb.status = 'active' AND gb.city = ? ORDER BY gb.deadline ASC`)
    .all(city) as GroupBuy[];
}

export function findMatchingGroupBuys(city: string, productQuery: string): GroupBuy[] {
  const terms = productQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = getDb()
    .prepare(`${GROUP_BUY_SELECT} WHERE gb.status = 'active' AND (gb.city = ? OR gb.city IS NULL) ORDER BY gb.deadline ASC`)
    .all(city) as GroupBuy[];
  return rows.filter(gb =>
    terms.some(t => gb.product_name?.toLowerCase().includes(t) || gb.category?.toLowerCase().includes(t))
  );
}

export function joinGroupBuy(
  groupBuyId: number,
  customerName: string,
  customerEmail: string,
  quantity: number
): JoinGroupBuyResult {
  const db = getDb();

  const gb = db.prepare(
    'SELECT * FROM group_buys WHERE id = ? AND status = ?'
  ).get(groupBuyId, 'active') as {
    id: number; product_id: number; target_qty: number; current_qty: number;
    regular_price: number; group_price: number;
  } | undefined;

  if (!gb) throw new Error('Group buy not found or not active');

  const product = getProductById(gb.product_id);

  const orderResult = db.prepare(`
    INSERT INTO orders (customer_name, customer_email, product_id, quantity, unit_price, total_price, order_type, group_buy_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'group', ?, 'pending_group')
  `).run(customerName, customerEmail, gb.product_id, quantity, gb.group_price, gb.group_price * quantity, groupBuyId);

  const orderId = orderResult.lastInsertRowid;

  db.prepare(`
    INSERT INTO group_buy_participants (group_buy_id, customer_name, customer_email, quantity, order_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(groupBuyId, customerName, customerEmail, quantity, orderId);

  const newQty = gb.current_qty + quantity;
  db.prepare('UPDATE group_buys SET current_qty = ? WHERE id = ?').run(newQty, groupBuyId);

  let threshold_reached = false;
  if (newQty >= gb.target_qty) {
    db.prepare(`UPDATE group_buys SET status = 'completed' WHERE id = ?`).run(groupBuyId);
    db.prepare(`UPDATE orders SET status = 'confirmed' WHERE group_buy_id = ?`).run(groupBuyId);
    threshold_reached = true;
  }

  return { orderId, threshold_reached, product_name: product?.name };
}
