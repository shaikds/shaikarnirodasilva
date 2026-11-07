import { EmptyState, LoadingBlock, useAuthStore, useTranslation } from '@rv/shared';
import { ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useWaiterSite } from '../lib/useSite';

export function SitePickerPage() {
  const { t, i18n } = useTranslation();
  const { me, sites } = useWaiterSite();
  const setSelected = useAuthStore((s) => s.setSelectedSite);
  const navigate = useNavigate();
  const Chevron = i18n.language === 'he' ? ChevronLeft : ChevronRight;

  const choose = (siteId: string) => {
    setSelected(siteId);
    navigate('/', { replace: true });
  };
  // A single site needs no choice.
  const only = sites.length === 1 ? sites[0]!.site_id : null;
  useEffect(() => {
    if (only) choose(only);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [only]);

  if (me.isLoading) return <LoadingBlock />;
  return (
    <Shell title={t('app.title')}>
      <h1 className="text-xl font-semibold">{t('sites.title')}</h1>
      <p className="mb-4 text-sm text-muted">{t('sites.hint')}</p>
      {sites.length === 0 ? (
        <EmptyState icon={<Store className="h-10 w-10" />} title={t('sites.none')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {sites.map((s) => (
            <li key={s.site_id}>
              <button
                type="button"
                onClick={() => choose(s.site_id)}
                className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-start text-lg font-semibold shadow-card hover:bg-surface-2"
              >
                <Store aria-hidden="true" className="h-6 w-6 text-primary" />
                <span className="flex-1">{s.name}</span>
                <Chevron aria-hidden="true" className="h-5 w-5 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
