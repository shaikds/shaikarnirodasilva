import type { ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { EstimateBadge } from './EstimateBadge';

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** Secondary line under the value (unit, comparison, time window). */
  hint?: ReactNode;
  icon?: ReactNode;
  /** Badge the value as an estimate; pass the method text to explain how it is derived. */
  estimate?: boolean | { method: ReactNode };
  tone?: 'default' | 'warning' | 'danger' | 'success';
  className?: string;
}

const TONE: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: '',
  warning: 'border-s-4 border-s-warning',
  danger: 'border-s-4 border-s-danger',
  success: 'border-s-4 border-s-success',
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  estimate,
  tone = 'default',
  className,
}: StatTileProps) {
  const id = useId();
  const method = typeof estimate === 'object' ? estimate.method : null;
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 shadow-card',
        TONE[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span id={id} className="text-sm font-medium text-muted">
          {label}
        </span>
        {icon && (
          <span aria-hidden="true" className="text-muted">
            {icon}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {estimate && <EstimateBadge />}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {method && <p className="text-xs leading-5 text-muted">{method}</p>}
    </div>
  );
}
