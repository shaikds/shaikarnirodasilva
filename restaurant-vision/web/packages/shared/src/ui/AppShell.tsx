// Layout + navigation. Desktop: a nav column on the start side (right in Hebrew).
// Mobile (< md): a menu button opens the same nav as a drawer from the start edge.
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { buttonClass } from './Button';

export interface AppShellProps {
  brand: ReactNode;
  /** Nav items (links), rendered as a vertical list. Use `navItemClass` for styling. */
  nav?: ReactNode;
  /** Header content at the end side (site switcher, language, theme, account). */
  headerEnd?: ReactNode;
  /** Optional strip under the header (e.g. offline banner). */
  banner?: ReactNode;
  children: ReactNode;
  /** Key that closes the mobile drawer when it changes (e.g. location.pathname). */
  navKey?: string;
}

/** Classes for a nav link; `active` marks the current page. */
export function navItemClass(active: boolean): string {
  return cn(
    'flex min-h-tap items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
    active ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2',
  );
}

export function AppShell({ brand, nav, headerEnd, banner, children, navKey }: AppShellProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [navKey]);

  useEffect(() => {
    if (!open) return;
    const first = drawerRef.current?.querySelector<HTMLElement>('a, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
      >
        {t('nav.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          {nav && (
            <button
              ref={menuButtonRef}
              type="button"
              className={buttonClass('ghost', 'sm', 'min-h-tap min-w-tap px-2 md:hidden')}
              aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={open}
              aria-controls="rv-mobile-nav"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
            </button>
          )}
          <div className="flex min-w-0 items-center gap-2">{brand}</div>
          <div className="ms-auto flex min-w-0 items-center gap-1">{headerEnd}</div>
        </div>
        {banner}
      </header>
      <div className="flex flex-1">
        {nav && (
          <aside className="hidden w-60 shrink-0 border-e border-border bg-surface md:block">
            <nav aria-label={t('nav.mainNav')} className="sticky top-14 p-3">
              {nav}
            </nav>
          </aside>
        )}
        {nav && open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 h-full w-full cursor-default bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div
              ref={drawerRef}
              id="rv-mobile-nav"
              className="absolute inset-y-0 start-0 w-72 max-w-[85vw] overflow-y-auto border-e border-border bg-surface p-3 shadow-xl"
            >
              <nav aria-label={t('nav.mainNav')}>{nav}</nav>
            </div>
          </div>
        )}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-4 focus:outline-none sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
