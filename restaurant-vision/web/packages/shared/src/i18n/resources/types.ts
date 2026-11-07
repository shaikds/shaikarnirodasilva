/** A tree of UI strings (an i18next namespace). */
export interface Messages {
  [key: string]: string | Messages;
}

/** Resources of one app or package: language -> namespace -> messages. */
export type ResourceBundle = Record<'he' | 'en', Record<string, Messages>>;
