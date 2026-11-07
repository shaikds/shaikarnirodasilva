import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  const { t } = useTranslation('common');
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-10 text-center',
        className,
      )}
    >
      <span aria-hidden="true" className="text-muted">
        {icon ?? <Inbox className="h-10 w-10" />}
      </span>
      <p className="text-base font-semibold">{title ?? t('empty.title')}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
