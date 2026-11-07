import { buttonClass, EmptyState, useTranslation } from '@rv/shared';
import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<Compass className="h-10 w-10" />}
      title={t('notFound.title')}
      action={
        <Link to="/" className={buttonClass('primary')}>
          {t('notFound.home')}
        </Link>
      }
    />
  );
}
