import { LanguageSwitcher, ThemeToggle, useTranslation } from '@rv/shared';
import type { ReactNode } from 'react';
import { LogoMark } from './Logo';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end gap-1 p-3">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 sm:items-center">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <LogoMark className="h-12 w-12" />
            <p className="text-sm font-medium text-muted" lang="en">
              {t('common:app.name')}
            </p>
            <h1 className="text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">{children}</div>
          <p className="mt-6 text-center text-xs text-muted">{t('common:privacy.short')}</p>
        </div>
      </main>
    </div>
  );
}
