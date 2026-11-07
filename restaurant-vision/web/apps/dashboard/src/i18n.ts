import { initI18n, type Locale } from '@rv/shared';
import { dashboardEn } from './locales/en';
import { dashboardHe } from './locales/he';

export const dashboardResources = {
  he: { dashboard: dashboardHe },
  en: { dashboard: dashboardEn },
};

export function initDashboardI18n(lng?: Locale) {
  return initI18n({ resources: dashboardResources, defaultNS: 'dashboard', lng });
}
