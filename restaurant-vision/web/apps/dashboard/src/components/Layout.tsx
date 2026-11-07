import {
  AppShell,
  ErrorBoundary,
  LanguageSwitcher,
  ThemeToggle,
  buttonClass,
  navItemClass,
  useAuthStore,
  useLogout,
  useTranslation,
} from '@rv/shared';
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { canOpen, useAccess, useCurrentSiteId } from '../lib/access';
import { Logo } from './Logo';

function SiteSwitcher({ currentSiteId }: { currentSiteId: string | undefined }) {
  const { t } = useTranslation();
  const { me, access } = useAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const setSelected = useAuthStore((s) => s.setSelectedSite);
  const sites = me.data?.sites ?? [];
  if (access.role !== 'owner' || sites.length < 2) return null;
  return (
    <label className="hidden items-center gap-2 text-sm sm:flex">
      <span className="text-muted">{t('siteSwitcher.label')}</span>
      <select
        className="min-h-[36px] max-w-[12rem] rounded-lg border border-border bg-surface px-2 text-sm"
        value={currentSiteId ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          setSelected(id);
          const m = /^\/sites\/[^/]+\/(\w+)/.exec(location.pathname);
          navigate(`/sites/${id}/${m?.[1] ?? 'live'}`);
        }}
      >
        {sites.map((s) => (
          <option key={s.site_id} value={s.site_id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const { me, access } = useAccess();
  const siteId = useCurrentSiteId();
  const location = useLocation();
  const logout = useLogout();
  const siteName = me.data?.sites.find((s) => s.site_id === siteId)?.name;

  const link = (to: string, label: string, Icon: typeof LayoutGrid, end = false) => (
    <li>
      <NavLink to={to} end={end} className={({ isActive }) => navItemClass(isActive)}>
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </NavLink>
    </li>
  );

  const nav = (
    <div className="flex flex-col gap-4">
      {access.role === 'owner' && (
        <ul className="flex flex-col gap-1">{link('/', t('nav.overview'), LayoutDashboard, true)}</ul>
      )}
      {siteId && (
        <div>
          {siteName && (
            <p className="mb-1 truncate px-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {t('nav.siteSection', { name: siteName })}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {link(`/sites/${siteId}/live`, t('nav.live'), LayoutGrid)}
            {link(`/sites/${siteId}/analytics`, t('nav.analytics'), BarChart3)}
            {link(`/sites/${siteId}/report`, t('nav.report'), FileText)}
            {link(`/sites/${siteId}/settings`, t('nav.settings'), Settings)}
          </ul>
        </div>
      )}
      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('nav.orgSection')}</p>
        <ul className="flex flex-col gap-1">
          {canOpen(access, 'users') && link('/users', t('nav.users'), Users)}
          {link('/compliance', t('nav.compliance'), ShieldCheck)}
        </ul>
      </div>
    </div>
  );

  const user = me.data?.user;
  return (
    <AppShell
      navKey={location.pathname}
      brand={<Logo />}
      nav={nav}
      headerEnd={
        <>
          <SiteSwitcher currentSiteId={siteId} />
          <LanguageSwitcher />
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            className={buttonClass('ghost', 'sm', 'px-2')}
            aria-label={t('common:actions.signOut')}
            title={
              user && access.role
                ? t('nav.signedInAs', { name: user.name, role: t(`roles.${access.role}`) })
                : undefined
            }
          >
            <LogOut aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" />
            <span className="hidden lg:inline">{t('common:actions.signOut')}</span>
          </button>
        </>
      }
    >
      <ErrorBoundary resetKey={location.pathname}>
        <Outlet />
      </ErrorBoundary>
    </AppShell>
  );
}
