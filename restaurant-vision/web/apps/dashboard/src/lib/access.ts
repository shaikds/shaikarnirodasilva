// Role-aware routing (architecture 7.2): owner sees everything, a manager sees their one site,
// a waiter belongs in the waiter app.
import { accessFromMe, canAccessSite, useAuthStore, useMe, type Access } from '@rv/shared';
import { useParams } from 'react-router-dom';

export type Landing = { kind: 'path'; path: string } | { kind: 'waiter' } | { kind: 'no-access' };

export function landingFor(access: Access): Landing {
  switch (access.role) {
    case 'owner':
      return { kind: 'path', path: '/' };
    case 'manager':
      return access.siteId
        ? { kind: 'path', path: `/sites/${access.siteId}/live` }
        : { kind: 'no-access' };
    case 'waiter':
      return { kind: 'waiter' };
    default:
      return { kind: 'no-access' };
  }
}

/** Pages and who may open them. Site pages additionally require access to that site. */
export type PageId =
  'overview' | 'live' | 'analytics' | 'report' | 'settings' | 'users' | 'compliance';

const PAGE_ROLES: Record<PageId, Access['role'][]> = {
  overview: ['owner'],
  live: ['owner', 'manager'],
  analytics: ['owner', 'manager'],
  report: ['owner', 'manager'],
  settings: ['owner', 'manager'],
  users: ['owner'],
  compliance: ['owner', 'manager'],
};

export function canOpen(access: Access, page: PageId, siteId?: string): boolean {
  if (!PAGE_ROLES[page].includes(access.role)) return false;
  if (siteId && !canAccessSite(access, siteId)) return false;
  return true;
}

/** URL of the waiter PWA (`VITE_WAITER_URL`). */
export function waiterAppUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_WAITER_URL) return env.VITE_WAITER_URL;
  return import.meta.env.DEV ? 'http://localhost:5174/' : '/waiter/';
}

export function useAccess() {
  const me = useMe();
  return { me, access: accessFromMe(me.data) };
}

/** Site in focus: the route's `:siteId`, else the last chosen site, else the first one. */
export function useCurrentSiteId(): string | undefined {
  const params = useParams();
  const selected = useAuthStore((s) => s.selectedSiteId);
  const { me, access } = useAccess();
  if (params.siteId) return params.siteId;
  if (access.role === 'manager' && access.siteId) return access.siteId;
  const ids = me.data?.sites.map((s) => s.site_id) ?? [];
  if (selected && ids.includes(selected)) return selected;
  return ids[0];
}
