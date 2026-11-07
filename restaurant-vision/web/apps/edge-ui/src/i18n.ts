import { initI18n, type Locale } from '@rv/shared';
import { edgeEn } from './locales/en';
import { edgeHe } from './locales/he';

export const edgeResources = {
  he: { edge: edgeHe },
  en: { edge: edgeEn },
};

export function initEdgeI18n(lng?: Locale) {
  return initI18n({ resources: edgeResources, defaultNS: 'edge', lng });
}
