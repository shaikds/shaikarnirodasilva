import { describe, expect, it } from 'vitest';
import { dashboardEn } from '../locales/en';
import { dashboardHe } from '../locales/he';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
const comparable = (keys: string[]) =>
  [...new Set(keys.filter((k) => !/_(two|many)$/.test(k)))].sort();

describe('dashboard locales', () => {
  it('Hebrew and English have the same keys', () => {
    expect(comparable(keysOf(dashboardHe))).toEqual(comparable(keysOf(dashboardEn)));
  });

  it('never mentions per-employee metrics', () => {
    const all = JSON.stringify(dashboardEn).toLowerCase();
    expect(all).not.toMatch(/per waiter|by waiter|waiter ranking|employee score/);
  });
});
