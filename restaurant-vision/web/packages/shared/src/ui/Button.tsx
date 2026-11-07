import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary/90 shadow-sm',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-2 shadow-sm',
  ghost: 'bg-transparent text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-sm dark:text-bg',
  success: 'bg-success text-white hover:bg-success/90 shadow-sm dark:text-bg',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-3 text-sm',
  md: 'min-h-tap px-4 text-sm',
  lg: 'min-h-[52px] px-5 text-base',
  xl: 'min-h-[64px] px-6 text-xl font-semibold',
};

export const buttonClass = (
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
) =>
  cn(
    'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={buttonClass(variant, size, cn(block && 'w-full', className))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" decorative className="text-current" />}
      {children}
    </button>
  );
});
