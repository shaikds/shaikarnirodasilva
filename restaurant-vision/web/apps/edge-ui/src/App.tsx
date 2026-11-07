import { createQueryClient, ErrorBoundary } from '@rv/shared';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LocalApiProvider } from './api/LocalApiProvider';
import { EdgeLayout } from './components/EdgeLayout';
import { HomePage } from './pages/HomePage';
import { LocalAlertsPage } from './pages/LocalAlertsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetupIndex, SetupLayout, SetupStepRoute } from './pages/setup/SetupLayout';
import { SetupProvider } from './pages/setup/SetupContext';

export function AppRoutes() {
  return (
    <Routes>
      {/* Offline waiter mode: its own minimal, mobile-first chrome. */}
      <Route path="local-alerts" element={<LocalAlertsPage />} />
      <Route element={<EdgeLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="setup"
          element={
            <SetupProvider>
              <SetupLayout />
            </SetupProvider>
          }
        >
          <Route index element={<SetupIndex />} />
          <Route path=":step" element={<SetupStepRoute />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

/** Query client + LAN API client, shared by the app and tests. */
export function EdgeProviders({
  children,
  queryClient,
  baseUrl,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
  baseUrl?: string;
}) {
  const [qc] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={qc}>
      <LocalApiProvider baseUrl={baseUrl}>{children}</LocalApiProvider>
    </QueryClientProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <EdgeProviders>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </EdgeProviders>
    </ErrorBoundary>
  );
}
