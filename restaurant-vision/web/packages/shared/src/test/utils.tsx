// Test helpers shared by every web package: providers, i18n in a chosen language and an
// MSW-backed mock backend with a signed-in user.
import type { QueryClient } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createDefaultApi, createQueryClient, RvProvider } from '../api/provider';
import { useAuthStore } from '../auth/store';
import type { Locale } from '../contracts';
import { i18n, initI18n, type InitI18nOptions } from '../i18n';
import type { MockDb } from '../mock/db';

export const TEST_ORIGIN = 'http://localhost:3000';

/** Initializes i18n synchronously in `lng` (default English for readable assertions). */
export async function setupTestI18n(
  lng: Locale = 'en',
  options: Omit<InitI18nOptions, 'lng'> = {},
) {
  initI18n({ ...options, lng });
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
  return i18n;
}

export function createTestQueryClient(): QueryClient {
  const qc = createQueryClient();
  qc.setDefaultOptions({
    queries: { retry: false, staleTime: 0, gcTime: Infinity, refetchOnWindowFocus: false },
    mutations: { retry: false },
  });
  return qc;
}

export function TestProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  return (
    <RvProvider
      queryClient={queryClient ?? createTestQueryClient()}
      api={createDefaultApi(TEST_ORIGIN)}
    >
      {children}
    </RvProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> & { queryClient?: QueryClient } = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  return {
    queryClient,
    ...render(ui, {
      ...options,
      wrapper: ({ children }) => (
        <TestProviders queryClient={queryClient}>{children}</TestProviders>
      ),
    }),
  };
}

/** Signs `email` in against the mock db by storing real mock tokens in the auth store. */
export function signInAs(db: MockDb, email: string): void {
  const user = [...db.users.values()].find((u) => u.email === email);
  if (!user) throw new Error(`no mock user ${email}`);
  useAuthStore.getState().setTokens(db.issueTokens(user.user_id));
}

export function signOut(): void {
  useAuthStore.getState().logout();
}

export { i18n };
