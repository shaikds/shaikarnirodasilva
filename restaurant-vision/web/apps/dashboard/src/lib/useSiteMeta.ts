import { useMe, useSiteSettings } from '@rv/shared';

/** Name, time zone and currency of a site (settings for staff, fallback to /me). */
export function useSiteMeta(siteId: string | undefined) {
  const me = useMe();
  const settings = useSiteSettings(siteId);
  const ref = me.data?.sites.find((s) => s.site_id === siteId);
  return {
    name: settings.data?.name ?? ref?.name ?? '',
    timezone: settings.data?.timezone ?? 'Asia/Jerusalem',
    currency: settings.data?.currency ?? 'ILS',
    settings: settings.data,
    isLoading: settings.isLoading,
  };
}
