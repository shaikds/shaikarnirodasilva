import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { authStoreAdapter } from '../auth/store';
import { reportReachability } from '../live/reachability';
import { createApiClient, type ApiClient } from './client';
import { createRvApi, type RvApi } from './endpoints';
import { isApiError } from './errors';

interface ApiContextValue {
  client: ApiClient;
  api: RvApi;
}

const ApiContext = createContext<ApiContextValue | null>(null);

/** The default client: VITE_API_URL, auth store tokens, reachability tracking. */
export function createDefaultApi(baseUrl?: string): ApiContextValue {
  const client = createApiClient({
    baseUrl,
    auth: authStoreAdapter,
    onReachability: reportReachability,
  });
  return { client, api: createRvApi(client) };
}

/** Query client defaults: no retries on 4xx, short stale time for live-ish data. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export interface RvProviderProps {
  children: ReactNode;
  queryClient?: QueryClient;
  api?: ApiContextValue;
}

/** Provides the API client and a React Query client to the tree. */
export function RvProvider({ children, queryClient, api }: RvProviderProps) {
  const qc = useMemo(() => queryClient ?? createQueryClient(), [queryClient]);
  const value = useMemo(() => api ?? createDefaultApi(), [api]);
  return (
    <ApiContext.Provider value={value}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): RvApi {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used inside <RvProvider>');
  return ctx.api;
}

export function useApiClient(): ApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApiClient must be used inside <RvProvider>');
  return ctx.client;
}
