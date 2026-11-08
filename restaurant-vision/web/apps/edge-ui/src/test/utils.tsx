import { createTestQueryClient, i18n } from '@rv/shared/test-utils';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppRoutes, EdgeProviders } from '../App';
import { storePin } from '../api/pin';
import { initEdgeI18n } from '../i18n';

export const TEST_EDGE = 'http://edge.test:8787';

export async function setupEdgeI18n(lng: 'he' | 'en' = 'en') {
  initEdgeI18n(lng);
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

/** The whole app at `path` against the MSW edge, with a probe showing the current path. */
export function renderEdge(path = '/') {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...render(
      <EdgeProviders queryClient={queryClient} baseUrl={TEST_EDGE}>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </EdgeProviders>,
    ),
  };
}

/** Unlocks setup for a test: PIN in this tab and local-only mode (pairing skipped). */
export function unlockSetup(pin: string) {
  storePin(pin);
  window.sessionStorage.setItem('rv-edge-pair-skipped', '1');
}
