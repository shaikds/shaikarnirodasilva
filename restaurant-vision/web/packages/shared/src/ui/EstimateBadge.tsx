import { Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

/** Marks a derived figure as an estimate ("הערכה" / "Estimate"). Never color-only. */
export function EstimateBadge({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  return (
    <span
      data-estimate="true"
      title={t('estimate.title')}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning',
        className,
      )}
    >
      <Calculator aria-hidden="true" className="h-3.5 w-3.5" />
      {t('estimate.badge')}
    </span>
  );
}
