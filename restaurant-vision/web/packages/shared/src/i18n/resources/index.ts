import { commonEn } from './en';
import { commonHe } from './he';

export { commonEn, commonHe };
export type { Messages, ResourceBundle } from './types';

/** Shared resources by language and namespace. */
export const sharedResources = {
  he: { common: commonHe },
  en: { common: commonEn },
} as const;
