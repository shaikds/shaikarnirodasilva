import { EmptyState, buttonClass, useTranslation } from '@rv/shared';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('notFound.title')}
      action={
        <Link to="/" className={buttonClass('secondary')}>
          {t('notFound.home')}
        </Link>
      }
    />
  );
}
