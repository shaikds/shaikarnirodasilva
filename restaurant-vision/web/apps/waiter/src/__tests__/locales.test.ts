import { describe, expect, it } from 'vitest';
import { waiterEn } from '../locales/en';
import { waiterHe } from '../locales/he';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
const comparable = (keys: string[]) =>
  [...new Set(keys.filter((k) => !/_(two|many)$/.test(k)))].sort();

describe('waiter locales', () => {
  it('Hebrew and English have the same keys', () => {
    expect(comparable(keysOf(waiterHe))).toEqual(comparable(keysOf(waiterEn)));
  });

  it('uses "בטיפול" / "On it" for the ack button', () => {
    expect(waiterHe.alerts.onIt).toBe('בטיפול');
    expect(waiterEn.alerts.onIt).toBe('On it');
  });
});
