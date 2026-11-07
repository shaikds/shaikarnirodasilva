// Role helpers derived from `Me.memberships` (architecture 7.2).
import type { Me, Role } from '../contracts';

export interface Access {
  /** Highest role the user holds: owner > manager > waiter. */
  role: Role | null;
  /** Owner: null (all sites). Manager/waiter: their one site. */
  siteId: string | null;
  /** Sites the user may open (from `Me.sites`). */
  siteIds: string[];
}

const RANK: Record<Role, number> = { owner: 3, manager: 2, waiter: 1 };

export function accessFromMe(me: Me | undefined | null): Access {
  if (!me) return { role: null, siteId: null, siteIds: [] };
  let best: { role: Role; site_id: string | null } | null = null;
  for (const m of me.memberships) {
    if (!best || RANK[m.role] > RANK[best.role]) best = m;
  }
  return {
    role: best?.role ?? null,
    siteId: best?.role === 'owner' ? null : (best?.site_id ?? null),
    siteIds: me.sites.map((s) => s.site_id),
  };
}

/** Whether `access` may open `siteId`. */
export function canAccessSite(access: Access, siteId: string): boolean {
  // Owners see every site of their org (sites created after the last `/me` included); the
  // backend enforces tenancy either way.
  if (access.role === 'owner') return true;
  return access.siteIds.includes(siteId) || access.siteId === siteId;
}
