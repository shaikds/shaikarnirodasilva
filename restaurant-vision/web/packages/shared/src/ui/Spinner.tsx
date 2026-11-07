import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export interface SpinnerProps {
  /** Accessible label; defaults to "Loading…". */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Inline spinners inside buttons are decorative (the button carries the state). */
  decorative?: boolean;
}

const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' };

export function Spinner({ label, size = 'md', className, decorative = false }: SpinnerProps) {
  const { t } = useTranslation('common');
  const circle = (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block animate-spin rounded-full border-current border-e-transparent align-middle text-primary motion-reduce:animate-none',
        SIZES[size],
        className,
      )}
    />
  );
  if (decorative) return circle;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {circle}
      <span className="sr-only">{label ?? t('status.loading')}</span>
    </span>
  );
}

/** Centered spinner for a loading page or panel. */
export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[8rem] items-center justify-center p-6">
      <Spinner size="lg" label={label} />
    </div>
  );
}
