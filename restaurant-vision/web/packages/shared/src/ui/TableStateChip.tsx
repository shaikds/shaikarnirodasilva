import { useTranslation } from 'react-i18next';
import type { TableState } from '../contracts';
import { cn } from '../lib/cn';
import { TABLE_STATE_STYLE } from './tableState';

export interface TableStateChipProps {
  state: TableState;
  size?: 'sm' | 'md';
  className?: string;
}

/** Table state as icon + text on its state color (never color alone). */
export function TableStateChip({ state, size = 'md', className }: TableStateChipProps) {
  const { t } = useTranslation('common');
  const style = TABLE_STATE_STYLE[state];
  const Icon = style.icon;
  return (
    <span
      data-state={state}
      title={t(`tableStateHint.${state}`)}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        style.chip,
        className,
      )}
    >
      <Icon aria-hidden="true" className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {t(`tableState.${state}`)}
    </span>
  );
}
