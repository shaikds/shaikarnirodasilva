import { TestProviders, createTestQueryClient, i18n } from '@rv/shared/test-utils';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WaiterRoutes } from '../App';
import { initWaiterI18n } from '../i18n';

export async function setupWaiterI18n(lng: 'he' | 'en' = 'en') {
  initWaiterI18n(lng);
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
}

export function renderWaiter(path = '/') {
  return render(
    <TestProviders queryClient={createTestQueryClient()}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WaiterRoutes />
      </MemoryRouter>
    </TestProviders>,
  );
}
