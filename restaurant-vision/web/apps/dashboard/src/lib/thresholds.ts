// Thresholds form model: field metadata, groups and validation mirroring the contract
// (every value > 0, long_queue_people an integer, track_id_ttl_h <= 24) plus sanity rules.
import type { Thresholds } from '@rv/shared';

export type ThresholdKey = keyof Thresholds;
export type ThresholdUnit = 's' | 'h' | 'people';

export interface ThresholdField {
  key: ThresholdKey;
  unit: ThresholdUnit;
  integer?: boolean;
  max: number;
}

export const THRESHOLD_GROUPS: { id: 'tables' | 'alerts' | 'queue' | 'system'; fields: ThresholdField[] }[] = [
  {
    id: 'tables',
    fields: [
      { key: 'seat_confirm_s', unit: 's', max: 3600 },
      { key: 'leave_confirm_s', unit: 's', max: 3600 },
      { key: 'staff_visit_min_s', unit: 's', max: 600 },
      { key: 'bussing_visit_min_s', unit: 's', max: 600 },
    ],
  },
  {
    id: 'alerts',
    fields: [
      { key: 'first_visit_timeout_s', unit: 's', max: 7200 },
      { key: 'checkin_timeout_s', unit: 's', max: 14400 },
      { key: 'bussing_timeout_s', unit: 's', max: 7200 },
    ],
  },
  {
    id: 'queue',
    fields: [
      { key: 'walkaway_min_wait_s', unit: 's', max: 3600 },
      { key: 'long_queue_people', unit: 'people', integer: true, max: 500 },
      { key: 'long_queue_wait_s', unit: 's', max: 14400 },
    ],
  },
  {
    id: 'system',
    fields: [
      { key: 'count_window_s', unit: 's', max: 600 },
      { key: 'snapshot_interval_s', unit: 's', max: 600 },
      { key: 'track_id_ttl_h', unit: 'h', max: 24 },
    ],
  },
];

export const THRESHOLD_FIELDS: ThresholdField[] = THRESHOLD_GROUPS.flatMap((g) => g.fields);

export type ThresholdValues = Record<ThresholdKey, string>;
export type ThresholdErrors = Partial<Record<ThresholdKey, { key: string; values?: Record<string, unknown> }>>;

export function toValues(t: Thresholds): ThresholdValues {
  return Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f.key, String(t[f.key])])) as ThresholdValues;
}

/** Validates form values; returns i18n error descriptors per field (empty = valid). */
export function validateThresholds(values: ThresholdValues): ThresholdErrors {
  const errors: ThresholdErrors = {};
  const num = (k: ThresholdKey) => Number(values[k]);
  for (const f of THRESHOLD_FIELDS) {
    const raw = values[f.key].trim();
    if (raw === '') {
      errors[f.key] = { key: 'settings.thresholds.errors.required' };
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) errors[f.key] = { key: 'settings.thresholds.errors.positive' };
    else if (f.integer && !Number.isInteger(v)) errors[f.key] = { key: 'settings.thresholds.errors.integer' };
    else if (v > f.max) errors[f.key] = { key: 'settings.thresholds.errors.max', values: { max: f.max } };
  }
  if (!errors.first_visit_timeout_s && !errors.seat_confirm_s && num('first_visit_timeout_s') <= num('seat_confirm_s')) {
    errors.first_visit_timeout_s = { key: 'settings.thresholds.errors.afterSeat' };
  }
  return errors;
}

export function toThresholds(values: ThresholdValues): Thresholds {
  return Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f.key, Number(values[f.key])])) as unknown as Thresholds;
}
