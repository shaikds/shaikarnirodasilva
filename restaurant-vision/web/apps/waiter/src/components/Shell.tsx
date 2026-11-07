import {
  ConnectionBadge,
  LanguageSwitcher,
  buttonClass,
  useTranslation,
  type LiveStatus,
} from '@rv/shared';
import { Settings, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useWaiterSettings } from '../lib/settings';

/** Mobile-first frame: sticky header with site, live status, sound and settings. */
export function Shell({
  title,
  status,
  banner,
  children,
}: {
  title: string;
  status?: LiveStatus;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const sound = useWaiterSettings((s) => s.sound);
  const setSound = useWaiterSettings((s) => s.setSound);
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg">
        {t('common:nav.skipToContent')}
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex min-h-[56px] items-center gap-2 px-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{title}</p>
            {status && <ConnectionBadge status={status} />}
          </div>
          <button
            type="button"
            onClick={() => setSound(!sound)}
            className={buttonClass('ghost', 'sm', 'min-h-tap min-w-tap px-2')}
            aria-pressed={sound}
            aria-label={sound ? t('header.soundOn') : t('header.soundOff')}
          >
            {sound ? <Volume2 aria-hidden="true" className="h-5 w-5" /> : <VolumeX aria-hidden="true" className="h-5 w-5" />}
          </button>
          <LanguageSwitcher className="min-h-tap" />
          <Link to="/settings" className={buttonClass('ghost', 'sm', 'min-h-tap min-w-tap px-2')} aria-label={t('header.settings')}>
            <Settings aria-hidden="true" className="h-5 w-5" />
          </Link>
        </div>
        {banner}
      </header>
      <main id="main" tabIndex={-1} className="flex-1 px-3 py-4 focus:outline-none" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
        {children}
      </main>
    </div>
  );
}
