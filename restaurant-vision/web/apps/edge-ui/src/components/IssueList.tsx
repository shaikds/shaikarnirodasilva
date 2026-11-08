// Validation issues as a list (messages from lib/issues).
import { cn, useTranslation } from '@rv/shared';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSetup } from '../pages/setup/setupState';
import { issueMessage } from '../lib/issues';
import type { Issue } from '../lib/validation';

export function IssueText({ issue }: { issue: Issue }) {
  const { t } = useTranslation();
  const ctx = useSetup();
  return <span dir="auto">{issueMessage(issue, ctx.config, t)}</span>;
}

export function IssueList({
  issues,
  action,
  className,
}: {
  issues: readonly Issue[];
  /** Optional link/button per issue (e.g. "Fix"). */
  action?: (issue: Issue) => ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const ctx = useSetup();
  if (issues.length === 0) return null;
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {issues.map((issue, i) => {
        const error = issue.severity === 'error';
        const Icon = error ? CircleAlert : TriangleAlert;
        return (
          <li
            key={`${issue.code}-${issue.id}-${i}`}
            className={cn(
              'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
              error ? 'bg-danger-soft text-fg' : 'bg-warning-soft text-fg',
            )}
          >
            <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', error ? 'text-danger' : 'text-warning')} />
            <span className="min-w-0 flex-1">
              <span className="sr-only">{error ? t('validation.errorPrefix') : t('validation.warningPrefix')}</span>
              <span dir="auto">{issueMessage(issue, ctx.config, t)}</span>
            </span>
            {action?.(issue)}
          </li>
        );
      })}
    </ul>
  );
}
