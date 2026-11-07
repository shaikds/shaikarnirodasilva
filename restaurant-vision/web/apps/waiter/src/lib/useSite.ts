import { useAuthStore, useMe } from '@rv/shared';

/** The site the waiter works at: the stored choice if still allowed, else the only one. */
export function useWaiterSite() {
  const me = useMe();
  const selected = useAuthStore((s) => s.selectedSiteId);
  const sites = me.data?.sites ?? [];
  const site = sites.find((s) => s.site_id === selected) ?? (sites.length === 1 ? sites[0] : undefined);
  return { me, sites, site };
}
