import type { TableState } from '@rv/shared';

/** Table overlay colours of the live view, as drawn by the edge
 * (rv_edge.runtime.snapshot.STATE_COLORS_RGB): gray, amber, green, blue. */
export const LIVE_STATE_COLORS: Record<TableState, string> = {
  empty: 'rgb(156 163 175)',
  seated: 'rgb(245 158 11)',
  attended: 'rgb(34 197 94)',
  needs_bussing: 'rgb(59 130 246)',
};
