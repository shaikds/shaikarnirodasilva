import { buttonClass, useTranslation } from '@rv/shared';
import { Smartphone } from 'lucide-react';
import { useEffect } from 'react';
import { waiterAppUrl } from '../lib/access';

/** Waiters belong in the waiter PWA: explain, link, and redirect. */
export function WaiterRedirectPage({ delayMs = 1500 }: { delayMs?: number }) {
  const { t } = useTranslation();
  const url = waiterAppUrl();
  useEffect(() => {
    const id = setTimeout(() => window.location.replace(url), delayMs);
    return () => clearTimeout(id);
  }, [url, delayMs]);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Smartphone aria-hidden="true" className="h-12 w-12 text-primary" />
        <h1 className="text-xl font-semibold">{t('waiterRedirect.title')}</h1>
        <p className="text-muted" role="status">
          {t('waiterRedirect.body')}
        </p>
        <a href={url} className={buttonClass('primary', 'lg')}>
          {t('waiterRedirect.open')}
        </a>
      </div>
    </main>
  );
}
