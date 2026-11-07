import { TestProviders, createTestQueryClient, i18n } from '@rv/shared/test-utils';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppRoutes } from '../App';
import { initDashboardI18n } from '../i18n';

export async function setupDashboardI18n(lng: 'he' | 'en' = 'en') {
  initDashboardI18n(lng);
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

/** Renders the whole route table at `path`, with a probe exposing the current pathname. */
export function renderApp(path: string) {
  const queryClient = createTestQueryClient();
  return render(
    <TestProviders queryClient={queryClient}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </TestProviders>,
  );
}

/** Renders one element inside providers and a router (route `pattern` gives params). */
export function renderRoute(ui: ReactElement, path: string, pattern = '*') {
  return render(
    <TestProviders>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path={pattern} element={ui} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
}
