import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import type { LiveStatus } from '../live/socket';

const DOT: Record<LiveStatus, string> = {
  idle: 'bg-muted',
  connecting: 'bg-warning',
  open: 'bg-success',
  reconnecting: 'bg-warning',
  closed: 'bg-danger',
};

/** Live connection indicator: colored dot plus text. */
export function ConnectionBadge({ status, className }: { status: LiveStatus; className?: string }) {
  const { t } = useTranslation('common');
  const text = t(`connection.${status}`);
  return (
    <span
      role="status"
      aria-label={t('connection.label', { status: text })}
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-muted', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-2.5 w-2.5 rounded-full',
          DOT[status],
          status === 'open' && 'motion-safe:animate-pulse',
        )}
      />
      {text}
    </span>
  );
}
