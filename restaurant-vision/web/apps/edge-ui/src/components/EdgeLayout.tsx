import {
  AppShell,
  buttonClass,
  cn,
  ErrorBoundary,
  LanguageSwitcher,
  ThemeToggle,
  useTranslation,
} from '@rv/shared';
import { BellRing, Gauge, Wrench } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from './Logo';

export function EdgeLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const links = [
    { to: '/', end: true, label: t('nav.status'), icon: Gauge },
    { to: '/setup', end: false, label: t('nav.setup'), icon: Wrench },
    { to: '/local-alerts', end: false, label: t('nav.alerts'), icon: BellRing },
  ];
  return (
    <AppShell
      brand={
        <NavLink to="/" className="flex min-w-0 items-center gap-2 rounded-md">
          <Logo />
          <span className="truncate text-sm font-semibold sm:text-base">{t('app.title')}</span>
        </NavLink>
      }
      headerEnd={
        <>
          <nav aria-label={t('common:nav.mainNav')} className="flex items-center gap-0.5">
            {links.map(({ to, end, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  buttonClass(
                    'ghost',
                    'sm',
                    cn('min-h-tap px-2 sm:px-3', isActive && 'bg-primary-soft text-primary'),
                  )
                }
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="sr-only md:not-sr-only">{label}</span>
              </NavLink>
            ))}
          </nav>
          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <LanguageSwitcher />
          <ThemeToggle />
        </>
      }
    >
      <ErrorBoundary resetKey={location.pathname}>
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </ErrorBoundary>
      <p className="mx-auto mt-10 max-w-6xl text-center text-xs text-muted">
        {t('common:privacy.short')}
      </p>
    </AppShell>
  );
}
