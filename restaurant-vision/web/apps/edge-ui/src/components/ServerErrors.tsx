// An edge API error, shown so an installer can act on it: the server's own validation messages
// (one per line, with where they apply) or a plain explanation of the failure kind.
import { Button, useTranslation } from '@rv/shared';
import { TriangleAlert, X } from 'lucide-react';
import { errorKind, serverProblems } from '../lib/errors';

export function ServerErrors({
  error,
  title,
  onDismiss,
}: {
  error: unknown;
  title?: string;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const problems = serverProblems(error);
  const kind = errorKind(error);
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm">
      <div className="flex items-start gap-2">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-danger">{title ?? t('errors.title')}</p>
          <p className="mt-0.5 text-fg">{t(`errors.${kind}`)}</p>
          {problems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 ps-5 text-fg" aria-label={t('errors.details')}>
              {problems.map((p, i) => (
                <li key={i}>
                  {p.where && (
                    <code className="me-1 rounded bg-surface px-1 py-0.5 text-xs" dir="ltr">
                      {p.where}
                    </code>
                  )}
                  <span dir="auto">{p.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} aria-label={t('common:actions.close')} className="px-2">
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
