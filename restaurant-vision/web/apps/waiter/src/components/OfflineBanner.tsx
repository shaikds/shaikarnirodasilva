import { useTranslation } from '@rv/shared';
import { ExternalLink, WifiOff } from 'lucide-react';

/** Shown when the cloud is unreachable > 10 s: points to the edge's LAN alerts page. */
export function OfflineBanner({ edgeUrl }: { edgeUrl: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="border-t border-warning/40 bg-warning-soft px-3 py-3 text-warning">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t('offline.title')}
      </p>
      <p className="mt-1 text-sm text-fg">{t('offline.body')}</p>
      <a
        href={edgeUrl}
        className="mt-2 inline-flex min-h-tap items-center gap-2 rounded-lg bg-warning px-4 font-semibold text-white dark:text-bg"
      >
        {t('offline.link')}
        <ExternalLink aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" />
      </a>
    </div>
  );
}
