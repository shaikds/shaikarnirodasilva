import { ErrorBoundary, RvProvider } from '@rv/shared';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HomeRoute, PublicOnly, RequireAuth, RequirePage, SiteScope } from './components/Guards';
import { Layout } from './components/Layout';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CompliancePage } from './pages/CompliancePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { ReportPage } from './pages/ReportPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignupPage } from './pages/SignupPage';
import { SiteLivePage } from './pages/SiteLivePage';
import { UsersPage } from './pages/UsersPage';

/** Route table (also rendered inside a MemoryRouter by tests). */
export function AppRoutes() {
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
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <SignupPage />
          </PublicOnly>
        }
      />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<HomeRoute overview={<OverviewPage />} />} />
          <Route path="sites/:siteId" element={<SiteScope />}>
            <Route index element={<Navigate to="live" replace />} />
            <Route
              path="live"
              element={
                <RequirePage page="live">
                  <SiteLivePage />
                </RequirePage>
              }
            />
            <Route
              path="analytics"
              element={
                <RequirePage page="analytics">
                  <AnalyticsPage />
                </RequirePage>
              }
            />
            <Route
              path="report"
              element={
                <RequirePage page="report">
                  <ReportPage />
                </RequirePage>
              }
            />
            <Route
              path="settings"
              element={
                <RequirePage page="settings">
                  <SettingsPage />
                </RequirePage>
              }
            />
          </Route>
          <Route
            path="users"
            element={
              <RequirePage page="users">
                <UsersPage />
              </RequirePage>
            }
          />
          <Route
            path="compliance"
            element={
              <RequirePage page="compliance">
                <CompliancePage />
              </RequirePage>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <RvProvider>
      <ErrorBoundary>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </ErrorBoundary>
    </RvProvider>
  );
}
