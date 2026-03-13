import { getDb } from './client';
import { joinTeam } from './teams';
import type { TeamJoinRequest } from '@/types';

export function createJoinRequest(
  teamId: number,
  customerName: string,
  customerEmail: string,
  quantity: number,
): number | bigint {
  const db = getDb();

  // Check team exists and is private
  const team = db.prepare('SELECT id, is_private, status FROM buying_teams WHERE id = ?').get(teamId) as {
    id: number; is_private: number; status: string;
  } | undefined;

  if (!team) throw new Error('Team not found');
  if (!team.is_private) throw new Error('This group is public — you can join directly');
  if (team.status !== 'forming') throw new Error('This group is no longer accepting members');

  // Check for existing pending request
  const existing = db.prepare(
    "SELECT id FROM team_join_requests WHERE team_id = ? AND customer_email = ? AND status = 'pending'"
  ).get(teamId, customerEmail);

  if (existing) throw new Error('You already have a pending request for this group');

  const result = db.prepare(`
    INSERT INTO team_join_requests (team_id, customer_name, customer_email, quantity)
    VALUES (?, ?, ?, ?)
  `).run(teamId, customerName, customerEmail, quantity);

  return result.lastInsertRowid;
}

export function getJoinRequestsForTeam(teamId: number): TeamJoinRequest[] {
  return getDb()
    .prepare(`
      SELECT jr.*, bt.invite_code, p.name as product_name, bt.creator_name as team_creator_name
      FROM team_join_requests jr
      JOIN buying_teams bt ON bt.id = jr.team_id
      JOIN group_buys gb ON gb.id = bt.group_buy_id
      JOIN products p ON p.id = gb.product_id
      WHERE jr.team_id = ?
      ORDER BY jr.created_at DESC
    `)
    .all(teamId) as TeamJoinRequest[];
}

export function approveJoinRequest(requestId: number, adminEmail: string) {
  const db = getDb();

  const req = db.prepare(`
    SELECT jr.*, bt.invite_code, bt.creator_email
    FROM team_join_requests jr
    JOIN buying_teams bt ON bt.id = jr.team_id
    WHERE jr.id = ? AND jr.status = 'pending'
  `).get(requestId) as {
    id: number; team_id: number; customer_name: string; customer_email: string;
    quantity: number; invite_code: string; creator_email: string;
  } | undefined;

  if (!req) throw new Error('Request not found or already processed');
  if (req.creator_email !== adminEmail) throw new Error('Only the group creator can approve requests');

  // Approve the request
  db.prepare("UPDATE team_join_requests SET status = 'approved' WHERE id = ?").run(requestId);

  // Temporarily make team public so joinTeam works, then restore
  const teamPrivacy = db.prepare('SELECT is_private FROM buying_teams WHERE id = ?').get(req.team_id) as { is_private: number };
  db.prepare('UPDATE buying_teams SET is_private = 0 WHERE id = ?').run(req.team_id);

  try {
    const result = joinTeam(req.invite_code, req.customer_name, req.customer_email, req.quantity);
    return result;
  } finally {
    // Restore privacy
    db.prepare('UPDATE buying_teams SET is_private = ? WHERE id = ?').run(teamPrivacy.is_private, req.team_id);
  }
}

export function rejectJoinRequest(requestId: number, adminEmail: string): void {
  const db = getDb();

  const req = db.prepare(`
    SELECT jr.*, bt.creator_email
    FROM team_join_requests jr
    JOIN buying_teams bt ON bt.id = jr.team_id
    WHERE jr.id = ? AND jr.status = 'pending'
  `).get(requestId) as { id: number; creator_email: string } | undefined;

  if (!req) throw new Error('Request not found or already processed');
  if (req.creator_email !== adminEmail) throw new Error('Only the group creator can reject requests');

  db.prepare("UPDATE team_join_requests SET status = 'rejected' WHERE id = ?").run(requestId);
}
