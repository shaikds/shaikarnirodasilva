import type { HTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading level of the title (default h2). */
  level?: 2 | 3;
  padded?: boolean;
}

export function Card({
  title,
  description,
  actions,
  level = 2,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  const id = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={title ? id : undefined}
      className={cn('rounded-xl border border-border bg-surface shadow-card', className)}
      {...rest}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && (
              <Heading id={id} className="text-base font-semibold leading-6">
                {title}
              </Heading>
            )}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-4')}>{children}</div>
    </section>
  );
}
