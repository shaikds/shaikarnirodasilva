import { EmptyState, useTranslation } from '@rv/shared';
import { Lock } from 'lucide-react';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<Lock className="h-10 w-10" />}
      title={t('forbidden.title')}
      description={t('forbidden.body')}
    />
  );
}
