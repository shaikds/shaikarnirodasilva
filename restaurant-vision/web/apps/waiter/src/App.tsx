import {
  ErrorBoundary,
  LoadingBlock,
  RvProvider,
  isApiError,
  selectIsAuthenticated,
  useAuthStore,
  useLogout,
  useMe,
} from '@rv/shared';
import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AlertsPage } from './pages/AlertsPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { SitePickerPage } from './pages/SitePickerPage';

function RequireAuth() {
  const signedIn = useAuthStore(selectIsAuthenticated);
  const me = useMe();
  const logout = useLogout();
  const authFailed = isApiError(me.error) && me.error.status === 401;
  useEffect(() => {
    if (authFailed) logout();
  }, [authFailed, logout]);
  if (!signedIn || authFailed) return <Navigate to="/login" replace />;
  if (me.isLoading) return <LoadingBlock />;
  return <Outlet />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const signedIn = useAuthStore(selectIsAuthenticated);
  return signedIn ? <Navigate to="/" replace /> : <>{children}</>;
}

export function WaiterRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route element={<RequireAuth />}>
        <Route index element={<AlertsPage />} />
        <Route path="/sites" element={<SitePickerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <RvProvider>
      <ErrorBoundary>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WaiterRoutes />
        </BrowserRouter>
      </ErrorBoundary>
    </RvProvider>
  );
}
