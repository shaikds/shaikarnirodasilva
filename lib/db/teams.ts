import { getDb } from './client';
import { getProductById } from './products';
import type { BuyingTeam } from '@/types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function nextOccurrenceOfDay(dayIndex: number): string {
  const now = new Date();
  const todayDay = now.getDay();
  let daysAhead = dayIndex - todayDay;
  if (daysAhead <= 0) daysAhead += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function expiresAtFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export function getDayName(dayIndex: number): string {
  return DAY_NAMES[dayIndex] ?? 'Wednesday';
}

export function getNextCutoffDate(dayIndex: number): string {
  return nextOccurrenceOfDay(dayIndex);
}

const TEAM_SELECT = `
  SELECT bt.*,
    gb.product_id, p.name as product_name, p.image_url, p.unit,
    gb.group_price, gb.regular_price, gb.team_min_qty, gb.cutoff_day,
    COALESCE(bt.city, gb.city) as city, gb.deadline, gb.status as group_buy_status,
    COALESCE(bt.neighborhood, gb.neighborhood) as neighborhood,
    s.name as supplier_name
  FROM buying_teams bt
  JOIN group_buys gb ON gb.id = bt.group_buy_id
  JOIN products p ON p.id = gb.product_id
  JOIN suppliers s ON s.id = p.supplier_id
`;

export function getTeamByInviteCode(inviteCode: string): BuyingTeam | undefined {
  return getDb()
    .prepare(`${TEAM_SELECT} WHERE bt.invite_code = ?`)
    .get(inviteCode) as BuyingTeam | undefined;
}

export function getTeamById(id: number): BuyingTeam | undefined {
  return getDb()
    .prepare(`${TEAM_SELECT} WHERE bt.id = ?`)
    .get(id) as BuyingTeam | undefined;
}

/** Get all teams (public + private) for the groups listing page */
export function getAllTeams(status = 'forming'): BuyingTeam[] {
  return getDb()
    .prepare(`${TEAM_SELECT} WHERE bt.status = ? AND gb.status = 'active' ORDER BY bt.created_at DESC`)
    .all(status) as BuyingTeam[];
}

/** Get teams filtered by city */
export function getTeamsByCity(city: string): BuyingTeam[] {
  return getDb()
    .prepare(`${TEAM_SELECT} WHERE bt.status = 'forming' AND gb.status = 'active' AND (bt.city = ? OR gb.city = ?) ORDER BY bt.created_at DESC`)
    .all(city, city) as BuyingTeam[];
}

export function getTeamMemberCount(teamId: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as cnt FROM group_buy_participants WHERE team_id = ?')
    .get(teamId) as { cnt: number };
  return row.cnt;
}

export interface CreateTeamResult {
  teamId: number | bigint;
  inviteCode: string;
}

export function createTeam(
  groupBuyId: number,
  creatorName: string,
  creatorEmail: string,
  quantity: number,
  options?: { is_private?: boolean; city?: string; neighborhood?: string },
): CreateTeamResult {
  const db = getDb();

  const gb = db.prepare(
    'SELECT * FROM group_buys WHERE id = ? AND status = ?'
  ).get(groupBuyId, 'active') as {
    id: number; product_id: number; group_price: number; team_min_qty: number;
  } | undefined;

  if (!gb) throw new Error('Group buy not found or not active');

  const product = getProductById(gb.product_id);
  if (!product) throw new Error('Product not found');
  if (product.stock_qty < quantity) throw new Error(`Only ${product.stock_qty} ${product.unit} in stock`);

  let inviteCode = generateInviteCode();
  while (db.prepare('SELECT id FROM buying_teams WHERE invite_code = ?').get(inviteCode)) {
    inviteCode = generateInviteCode();
  }

  const expiresAt = expiresAtFromNow();
  const isPrivate = options?.is_private ? 1 : 0;
  const city = options?.city ?? null;
  const neighborhood = options?.neighborhood ?? null;

  const teamResult = db.prepare(`
    INSERT INTO buying_teams (group_buy_id, invite_code, creator_name, creator_email, current_qty, is_private, city, neighborhood, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(groupBuyId, inviteCode, creatorName, creatorEmail, quantity, isPrivate, city, neighborhood, expiresAt);

  const teamId = teamResult.lastInsertRowid;

  const orderId = db.prepare(`
    INSERT INTO orders (customer_name, customer_email, product_id, quantity, unit_price, total_price, order_type, group_buy_id, status, team_id)
    VALUES (?, ?, ?, ?, ?, ?, 'group', ?, 'pending_group', ?)
  `).run(creatorName, creatorEmail, gb.product_id, quantity, gb.group_price, gb.group_price * quantity, groupBuyId, teamId).lastInsertRowid;

  db.prepare(`
    INSERT INTO group_buy_participants (group_buy_id, customer_name, customer_email, quantity, order_id, team_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(groupBuyId, creatorName, creatorEmail, quantity, orderId, teamId);

  db.prepare('UPDATE group_buys SET current_qty = current_qty + ? WHERE id = ?').run(quantity, groupBuyId);

  return { teamId, inviteCode };
}

/** Toggle team privacy */
export function setTeamPrivacy(teamId: number, isPrivate: boolean, adminEmail: string): void {
  const db = getDb();
  const team = db.prepare('SELECT creator_email FROM buying_teams WHERE id = ?').get(teamId) as { creator_email: string } | undefined;
  if (!team) throw new Error('Team not found');
  if (team.creator_email !== adminEmail) throw new Error('Only the team creator can change privacy');
  db.prepare('UPDATE buying_teams SET is_private = ? WHERE id = ?').run(isPrivate ? 1 : 0, teamId);
}

export interface JoinTeamResult {
  orderId: number | bigint;
  team_completed: boolean;
  product_name: string | undefined;
  invite_code: string;
}

export function joinTeam(
  inviteCode: string,
  customerName: string,
  customerEmail: string,
  quantity: number,
): JoinTeamResult {
  const db = getDb();

  const team = db.prepare(`
    SELECT bt.*, gb.group_price, gb.product_id, gb.team_min_qty, gb.status as gb_status, p.name as product_name, p.stock_qty, p.unit
    FROM buying_teams bt
    JOIN group_buys gb ON gb.id = bt.group_buy_id
    JOIN products p ON p.id = gb.product_id
    WHERE bt.invite_code = ?
  `).get(inviteCode) as {
    id: number; group_buy_id: number; group_price: number; product_id: number;
    team_min_qty: number; current_qty: number; gb_status: string;
    product_name: string; stock_qty: number; unit: string; status: string;
    is_private: number;
  } | undefined;

  if (!team) throw new Error('Team not found');
  if (team.status === 'completed') throw new Error('This team has already completed its purchase');
  if (team.status === 'expired') throw new Error('This team has expired');
  if (team.gb_status !== 'active') throw new Error('This group buy is no longer active');
  if (team.stock_qty < quantity) throw new Error(`Only ${team.stock_qty} ${team.unit} available`);
  if (team.is_private) throw new Error('This is a private group — please request to join instead');

  const newTeamQty = team.current_qty + quantity;

  const orderId = db.prepare(`
    INSERT INTO orders (customer_name, customer_email, product_id, quantity, unit_price, total_price, order_type, group_buy_id, status, team_id)
    VALUES (?, ?, ?, ?, ?, ?, 'group', ?, 'pending_group', ?)
  `).run(customerName, customerEmail, team.product_id, quantity, team.group_price, team.group_price * quantity, team.group_buy_id, team.id).lastInsertRowid;

  db.prepare(`
    INSERT INTO group_buy_participants (group_buy_id, customer_name, customer_email, quantity, order_id, team_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(team.group_buy_id, customerName, customerEmail, quantity, orderId, team.id);

  db.prepare('UPDATE buying_teams SET current_qty = ? WHERE id = ?').run(newTeamQty, team.id);
  db.prepare('UPDATE group_buys SET current_qty = current_qty + ? WHERE id = ?').run(quantity, team.group_buy_id);

  let team_completed = false;
  if (newTeamQty >= team.team_min_qty) {
    db.prepare("UPDATE buying_teams SET status = 'completed' WHERE id = ?").run(team.id);
    db.prepare("UPDATE orders SET status = 'confirmed' WHERE team_id = ?").run(team.id);
    team_completed = true;
  }

  return { orderId, team_completed, product_name: team.product_name, invite_code: inviteCode };
}

export interface CheckCutoffResult {
  confirmed_teams: number;
  total_orders_confirmed: number;
  reset_teams: number;
}

/**
 * Weekly cutoff check:
 * - Teams that reached min_qty → confirm orders (ordered for supplier)
 * - Teams that did NOT reach min_qty → reset qty to 0, cancel pending orders, keep team forming
 */
export function checkCutoffDay(): CheckCutoffResult {
  const db = getDb();
  const todayDay = new Date().getDay();

  // 1. Confirm teams that reached minimum
  const eligibleTeams = db.prepare(`
    SELECT bt.id, bt.current_qty, gb.team_min_qty
    FROM buying_teams bt
    JOIN group_buys gb ON gb.id = bt.group_buy_id
    WHERE bt.status = 'forming'
      AND gb.status = 'active'
      AND gb.cutoff_day = ?
      AND bt.current_qty >= gb.team_min_qty
  `).all(todayDay) as { id: number; current_qty: number; team_min_qty: number }[];

  let totalOrders = 0;
  for (const team of eligibleTeams) {
    const result = db.prepare("UPDATE orders SET status = 'confirmed' WHERE team_id = ? AND status = 'pending_group'").run(team.id);
    db.prepare("UPDATE buying_teams SET status = 'completed' WHERE id = ?").run(team.id);
    totalOrders += result.changes;
  }

  // 2. Reset teams that did NOT reach minimum
  const resetTeams = db.prepare(`
    SELECT bt.id, bt.current_qty, bt.group_buy_id, gb.team_min_qty
    FROM buying_teams bt
    JOIN group_buys gb ON gb.id = bt.group_buy_id
    WHERE bt.status = 'forming'
      AND gb.status = 'active'
      AND gb.cutoff_day = ?
      AND bt.current_qty < gb.team_min_qty
  `).all(todayDay) as { id: number; current_qty: number; group_buy_id: number; team_min_qty: number }[];

  for (const team of resetTeams) {
    // Cancel all pending orders for this team
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE team_id = ? AND status = 'pending_group'").run(team.id);
    // Remove participants so they can rejoin
    db.prepare('DELETE FROM group_buy_participants WHERE team_id = ?').run(team.id);
    // Subtract the team's qty from the group buy
    db.prepare('UPDATE group_buys SET current_qty = MAX(0, current_qty - ?) WHERE id = ?').run(team.current_qty, team.group_buy_id);
    // Reset team qty to 0 (keep forming status so people can rejoin)
    db.prepare('UPDATE buying_teams SET current_qty = 0 WHERE id = ?').run(team.id);
  }

  return { confirmed_teams: eligibleTeams.length, total_orders_confirmed: totalOrders, reset_teams: resetTeams.length };
}

/** Expire teams older than 7 days that are still forming */
export function expireOldTeams(): { expired_count: number } {
  const db = getDb();
  const now = new Date().toISOString();

  const expired = db.prepare(`
    SELECT bt.id, bt.current_qty, bt.group_buy_id
    FROM buying_teams bt
    WHERE bt.status = 'forming'
      AND bt.expires_at IS NOT NULL
      AND bt.expires_at < ?
  `).all(now) as { id: number; current_qty: number; group_buy_id: number }[];

  for (const team of expired) {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE team_id = ? AND status = 'pending_group'").run(team.id);
    db.prepare('DELETE FROM group_buy_participants WHERE team_id = ?').run(team.id);
    db.prepare('UPDATE group_buys SET current_qty = MAX(0, current_qty - ?) WHERE id = ?').run(team.current_qty, team.group_buy_id);
    db.prepare("UPDATE buying_teams SET status = 'expired' WHERE id = ?").run(team.id);
  }

  return { expired_count: expired.length };
}
