// @rv/shared: contracts, API client + hooks, auth, live data, i18n, formatters, UI kit.
// Mock backend (MSW) lives in '@rv/shared/mock' so production bundles never include it.

// contracts
export * from './contracts';

// api
export {
  createApiClient,
  type ApiClient,
  type ApiClientConfig,
  type AuthAdapter,
  type RequestOptions,
} from './api/client';
export {
  createRvApi,
  type RvApi,
  type TimeRange,
  type TimeseriesQuery,
  type AlertStatusFilter,
} from './api/endpoints';
export { ApiError, isApiError, detailMessage, parseRetryAfter } from './api/errors';
export * from './api/hooks';
export {
  RvProvider,
  createDefaultApi,
  createQueryClient,
  useApi,
  useApiClient,
} from './api/provider';
export { queryKeys } from './api/queryKeys';

// auth
export {
  useAuthStore,
  authStoreAdapter,
  selectIsAuthenticated,
  AUTH_STORAGE_KEY,
  type AuthState,
} from './auth/store';
export { accessFromMe, canAccessSite, type Access } from './auth/roles';

// live
export { alertSince, alertWaitingS, applyEvent, isDeviceOnline } from './live/applyEvent';
export { useSiteLive, type LiveConnection, type UseSiteLiveOptions } from './live/useSiteLive';
export {
  LiveSocket,
  computeBackoff,
  DEFAULT_BACKOFF,
  WS_CLOSE_BAD_REQUEST,
  WS_CLOSE_FORBIDDEN,
  WS_CLOSE_UNAUTHORIZED,
  type LiveStatus,
  type LiveSocketOptions,
  type BackoffOptions,
} from './live/socket';
export { useReachability, reportReachability } from './live/reachability';

// i18n
export {
  i18n,
  initI18n,
  setLanguage,
  currentLanguage,
  applyDocumentLanguage,
  directionOf,
  isLocale,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  useTranslation,
  Trans,
  type InitI18nOptions,
} from './i18n';
export * from './i18n/format';
export { useFormatters } from './i18n/useFormatters';
export { sharedResources, type Messages, type ResourceBundle } from './i18n/resources';

// time
export * from './time/zoned';
export { useNow } from './time/useNow';

// theme
export { useThemeStore, applyTheme, initTheme, type ThemeMode } from './theme/theme';

// lib
export { cn } from './lib/cn';
export { rvEnv, API_PREFIX } from './lib/env';
export { safeGetItem, safeSetItem, safeRemoveItem, safeStateStorage } from './lib/storage';

// ui
export * from './ui';
