import { DEFAULT_THRESHOLDS } from '@rv/shared';
import { describe, expect, it } from 'vitest';
import { toThresholds, toValues, validateThresholds } from '../lib/thresholds';

describe('thresholds validation', () => {
  it('accepts the contract defaults', () => {
    expect(validateThresholds(toValues(DEFAULT_THRESHOLDS))).toEqual({});
    expect(toThresholds(toValues(DEFAULT_THRESHOLDS))).toEqual(DEFAULT_THRESHOLDS);
  });

  it('rejects empty, zero, negative, fractional people and > 24 h rotation', () => {
    const v = toValues(DEFAULT_THRESHOLDS);
    const errors = validateThresholds({
      ...v,
      seat_confirm_s: '',
      leave_confirm_s: '0',
      staff_visit_min_s: '-3',
      long_queue_people: '7.5',
      track_id_ttl_h: '48',
    });
    expect(errors.seat_confirm_s?.key).toBe('settings.thresholds.errors.required');
    expect(errors.leave_confirm_s?.key).toBe('settings.thresholds.errors.positive');
    expect(errors.staff_visit_min_s?.key).toBe('settings.thresholds.errors.positive');
    expect(errors.long_queue_people?.key).toBe('settings.thresholds.errors.integer');
    expect(errors.track_id_ttl_h).toEqual({
      key: 'settings.thresholds.errors.max',
      values: { max: 24 },
    });
  });

  it('requires the first-visit alert to come after seat confirmation', () => {
    const v = toValues(DEFAULT_THRESHOLDS);
    expect(
      validateThresholds({ ...v, first_visit_timeout_s: '15' }).first_visit_timeout_s?.key,
    ).toBe('settings.thresholds.errors.afterSeat');
  });
});
