import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export function ErrorFallback({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation('common');
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-danger/40 bg-danger-soft p-6 text-center"
    >
      <TriangleAlert aria-hidden="true" className="h-8 w-8 text-danger" />
      <p className="text-base font-semibold">{t('errors.boundaryTitle')}</p>
      <p className="text-sm text-muted">{t('errors.boundaryBody')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && <Button onClick={onRetry}>{t('actions.retry')}</Button>}
        <Button variant="secondary" onClick={() => window.location.reload()}>
          {t('errors.reload')}
        </Button>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (reset: () => void, error: Error) => ReactNode;
  /** Changing this value resets the boundary (e.g. the route path). */
  resetKey?: unknown;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (error)
      return this.props.fallback?.(this.reset, error) ?? <ErrorFallback onRetry={this.reset} />;
    return this.props.children;
  }
}
