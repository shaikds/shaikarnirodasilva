import { useFormatters, useTranslation, type Currency } from '@rv/shared';

/** Formatters that render `null` as "—" (or "not enough data" where asked). */
export function useFmt() {
  const f = useFormatters();
  const { t } = useTranslation();
  const none = t('common:status.none');
  return {
    ...f,
    none,
    dur: (v: number | null | undefined) => (v === null || v === undefined ? none : f.duration(v)),
    num: (v: number | null | undefined, digits = 0) =>
      v === null || v === undefined ? none : f.number(v, digits),
    money: (v: number | null | undefined, currency: Currency) =>
      v === null || v === undefined ? t('common:status.notEnoughData') : f.currency(v, currency),
  };
}
