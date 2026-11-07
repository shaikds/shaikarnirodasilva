import {
  isApiError,
  LoadingBlock,
  selectIsAuthenticated,
  useAuthStore,
  useLogout,
} from '@rv/shared';
import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { canOpen, landingFor, useAccess, type PageId } from '../lib/access';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { WaiterRedirectPage } from '../pages/WaiterRedirectPage';

/** Signed-in area: loads `/me`, sends waiters to the waiter app. */
export function RequireAuth() {
  const signedIn = useAuthStore(selectIsAuthenticated);
  const location = useLocation();
  const { me, access } = useAccess();
  const logout = useLogout();
  const authFailed = isApiError(me.error) && me.error.status === 401;

  useEffect(() => {
    if (authFailed) logout();
  }, [authFailed, logout]);

  if (!signedIn || authFailed)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.isLoading || !me.data) {
    if (me.isError) return <ForbiddenPage />;
    return <LoadingBlock />;
  }
  if (access.role === 'waiter') return <WaiterRedirectPage />;
  if (!access.role) return <ForbiddenPage />;
  return <Outlet />;
}

/** Only signed-out users (login, signup). */
export function PublicOnly({ children }: { children: ReactNode }) {
  const signedIn = useAuthStore(selectIsAuthenticated);
  if (signedIn) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Redirects to the user's landing page when their role may not open `page`. */
export function RequirePage({ page, children }: { page: PageId; children: ReactNode }) {
  const { siteId } = useParams();
  const location = useLocation();
  const { access } = useAccess();
  if (canOpen(access, page, siteId)) return <>{children}</>;
  const landing = landingFor(access);
  if (landing.kind === 'path' && landing.path !== location.pathname) {
    return <Navigate to={landing.path} replace />;
  }
  return <ForbiddenPage />;
}

/** `/sites/:siteId/*`: remembers the chosen site. */
export function SiteScope() {
  const { siteId } = useParams();
  const setSelected = useAuthStore((s) => s.setSelectedSite);
  useEffect(() => {
    if (siteId) setSelected(siteId);
  }, [siteId, setSelected]);
  return <Outlet />;
}

/** `/`: owners get the overview, managers their site's live floor. */
export function HomeRoute({ overview }: { overview: ReactNode }) {
  const { access } = useAccess();
  const landing = landingFor(access);
  if (access.role === 'owner') return <>{overview}</>;
  if (landing.kind === 'path') return <Navigate to={landing.path} replace />;
  return <ForbiddenPage />;
}
