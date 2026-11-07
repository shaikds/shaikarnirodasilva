import { cn, useTranslation } from '@rv/shared';
import { RANGE_KEYS, type RangeKey } from '../lib/range';

/** Segmented control for the reporting period (radio semantics). */
export function RangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="inline-flex rounded-lg border border-border bg-surface p-0.5 shadow-sm">
      <legend className="sr-only">{t('range.label')}</legend>
      {RANGE_KEYS.map((key) => (
        <label
          key={key}
          className={cn(
            'flex min-h-[36px] cursor-pointer items-center rounded-md px-3 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
            value === key ? 'bg-primary text-primary-fg' : 'text-fg hover:bg-surface-2',
          )}
        >
          <input
            type="radio"
            name="range"
            value={key}
            checked={value === key}
            onChange={() => onChange(key)}
            className="sr-only"
          />
          {t(`range.${key}`)}
        </label>
      ))}
    </fieldset>
  );
}
