import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZONE_KINDS } from '../lib/zones';
import { STEPS } from '../lib/wizard';
import { edgeEn } from '../locales/en';
import { edgeHe } from '../locales/he';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
const comparable = (keys: string[]) => [...new Set(keys.filter((k) => !/_(two|many)$/.test(k)))].sort();
const enKeys = new Set(keysOf(edgeEn).map((k) => k.replace(/_(one|other)$/, '')));
const heKeys = keysOf(edgeHe);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'locales' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('edge-ui locales', () => {
  it('Hebrew and English have the same keys', () => {
    expect(comparable(heKeys)).toEqual(comparable(keysOf(edgeEn)));
  });

  it('every Hebrew plural has a "two" form (i18next has no fallback for it)', () => {
    const plurals = heKeys.filter((k) => k.endsWith('_other')).map((k) => k.slice(0, -'_other'.length));
    for (const base of plurals) expect(heKeys).toContain(`${base}_two`);
  });

  it('every static key used in the code exists', () => {
    const src = join(__dirname, '..');
    const used = new Set<string>();
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) used.add(m[1]!);
      for (const m of text.matchAll(/'((?:zones|suggest|pin|setup|cameras)\.[\w.]+)'/g)) used.add(m[1]!);
    }
    const missing = [...used].filter((k) => !k.startsWith('common:') && !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('dynamic keys exist for every value', () => {
    const dynamic = [
      ...STEPS.flatMap((s) => [`steps.${s}.title`, `steps.${s}.short`, `steps.${s}.intro`]),
      ...ZONE_KINDS.flatMap((k) => [`zoneKind.${k}`, `zoneKindHint.${k}`]),
      ...['simulated_camera', 'no_model', 'no_frame'].map((n) => `suggest.note.${n}`),
      ...['network', 'pin', 'locked', 'notFound', 'conflict', 'invalid', 'server'].map((k) => `errors.${k}`),
    ];
    expect(dynamic.filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('never mentions per-employee metrics', () => {
    expect(JSON.stringify(edgeEn).toLowerCase()).not.toMatch(/per waiter|by waiter|waiter ranking|employee score/);
  });
});
