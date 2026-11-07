// Visual language of table states, shared by the chip and the dashboard floor plan.
// empty = neutral gray, seated = amber, attended = green, needs_bussing = blue; always with
// an icon and text so color is never the only signal.
import { CircleCheck, CircleDashed, Hourglass, Sparkles, type LucideIcon } from 'lucide-react';
import type { TableState } from '../contracts';

export interface TableStateStyle {
  icon: LucideIcon;
  /** Tailwind classes for chips (background, text, border). */
  chip: string;
  /** CSS colors (variables) for SVG fills/strokes. */
  fill: string;
  stroke: string;
  text: string;
}

export const TABLE_STATE_STYLE: Record<TableState, TableStateStyle> = {
  empty: {
    icon: CircleDashed,
    chip: 'bg-state-empty-bg text-state-empty-fg border-state-empty-stroke',
    fill: 'rgb(var(--rv-state-empty-bg))',
    stroke: 'rgb(var(--rv-state-empty-stroke))',
    text: 'rgb(var(--rv-state-empty-fg))',
  },
  seated: {
    icon: Hourglass,
    chip: 'bg-state-seated-bg text-state-seated-fg border-state-seated-stroke',
    fill: 'rgb(var(--rv-state-seated-bg))',
    stroke: 'rgb(var(--rv-state-seated-stroke))',
    text: 'rgb(var(--rv-state-seated-fg))',
  },
  attended: {
    icon: CircleCheck,
    chip: 'bg-state-attended-bg text-state-attended-fg border-state-attended-stroke',
    fill: 'rgb(var(--rv-state-attended-bg))',
    stroke: 'rgb(var(--rv-state-attended-stroke))',
    text: 'rgb(var(--rv-state-attended-fg))',
  },
  needs_bussing: {
    icon: Sparkles,
    chip: 'bg-state-bussing-bg text-state-bussing-fg border-state-bussing-stroke',
    fill: 'rgb(var(--rv-state-bussing-bg))',
    stroke: 'rgb(var(--rv-state-bussing-stroke))',
    text: 'rgb(var(--rv-state-bussing-fg))',
  },
};
