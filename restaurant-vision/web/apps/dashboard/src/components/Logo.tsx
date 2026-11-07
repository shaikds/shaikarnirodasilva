import { useTranslation } from '@rv/shared';
import { Link } from 'react-router-dom';

export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="14" fill="rgb(var(--rv-primary))" />
      <circle
        cx="32"
        cy="32"
        r="15"
        fill="none"
        stroke="rgb(var(--rv-primary-fg))"
        strokeWidth="5"
      />
      <circle cx="32" cy="32" r="5" fill="rgb(var(--rv-primary-fg))" />
    </svg>
  );
}

export function Logo() {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className="flex min-h-tap items-center gap-2 rounded-lg px-1 font-semibold"
      aria-label={t('common:app.name')}
    >
      <LogoMark />
      <span className="hidden truncate sm:inline" lang="en">
        {t('common:app.name')}
      </span>
    </Link>
  );
}
