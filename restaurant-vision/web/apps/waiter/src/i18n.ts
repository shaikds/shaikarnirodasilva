import { initI18n, type Locale } from '@rv/shared';
import { waiterEn } from './locales/en';
import { waiterHe } from './locales/he';

export const waiterResources = {
  he: { waiter: waiterHe },
  en: { waiter: waiterEn },
};

export function initWaiterI18n(lng?: Locale) {
  return initI18n({ resources: waiterResources, defaultNS: 'waiter', lng });
}
