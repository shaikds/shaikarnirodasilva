// Accessible tabs (WAI-ARIA tabs pattern) with RTL-aware arrow keys.
import { cn, directionOf, useTranslation } from '@rv/shared';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  children: ReactNode;
}) {
  const { i18n } = useTranslation();
  const rtl = directionOf(i18n.language) === 'rtl';
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));

  const onKeyDown = (e: KeyboardEvent) => {
    let next = -1;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forward) next = (index + 1) % tabs.length;
    else if (e.key === back) next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-border" onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={tab.id === value}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === value ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px min-h-tap whitespace-nowrap border-b-2 px-3 text-sm font-medium',
              tab.id === value ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} tabIndex={0} className="focus:outline-none">
        {children}
      </div>
    </div>
  );
}
