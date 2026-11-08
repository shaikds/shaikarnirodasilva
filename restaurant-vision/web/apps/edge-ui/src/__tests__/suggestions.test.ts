// Accepting table suggestions: numbering, seats, primary zones, polygon fallback.
import { describe, expect, it } from 'vitest';
import type { TableSuggestion } from '../api/types';
import { acceptSuggestions, nextTableLabels, suggestionPolygon } from '../lib/suggestions';
import { errorsOf, validateConfig } from '../lib/validation';
import { sampleConfig } from './fixtures';

const suggestion = (id: string, seats = 4, confidence = 0.8): TableSuggestion => ({
  suggestion_id: id,
  polygon: [
    [0.5, 0.5],
    [0.7, 0.5],
    [0.7, 0.7],
    [0.5, 0.7],
  ],
  table_box: [0.52, 0.52, 0.68, 0.68],
  seats_est: seats,
  confidence,
});

describe('nextTableLabels', () => {
  it('uses the lowest free numbers and never collides with existing labels', () => {
    expect(nextTableLabels([], 3)).toEqual(['1', '2', '3']);
    expect(nextTableLabels(['1', '2', '5', 'Bar'], 3)).toEqual(['3', '4', '6']);
    expect(nextTableLabels([' 1 ', '3', '12A'], 2)).toEqual(['2', '4']);
  });
});

describe('acceptSuggestions', () => {
  it('creates a numbered table and a primary table zone per suggestion', () => {
    const config = sampleConfig(); // tables "1" and "2"
    const { config: next, accepted } = acceptSuggestions(config, 'dining', [suggestion('s1', 6), suggestion('s2', 99)]);
    expect(accepted).toHaveLength(2);
    const added = next.tables.slice(config.tables.length);
    expect(added.map((t) => t.label)).toEqual(['3', '4']);
    expect(added.map((t) => t.seats)).toEqual([6, 50]); // clamped to the contract's 1..50
    const zones = next.zones.slice(config.zones.length);
    expect(zones).toHaveLength(2);
    expect(zones.every((z) => z.kind === 'table' && z.primary && z.camera_id === 'dining')).toBe(true);
    expect(zones.map((z) => z.table_id)).toEqual(added.map((t) => t.table_id));
    // Ids are unique and the result is a valid config.
    expect(new Set(next.tables.map((t) => t.table_id)).size).toBe(next.tables.length);
    expect(new Set(next.zones.map((z) => z.zone_id)).size).toBe(next.zones.length);
    expect(errorsOf(validateConfig(next))).toEqual([]);
  });

  it('keeps everything else of the config (thresholds, modules, other zones)', () => {
    const config = sampleConfig();
    const { config: next } = acceptSuggestions(config, 'dining', [suggestion('s1')]);
    expect(next.thresholds).toEqual(config.thresholds);
    expect(next.modules).toEqual(config.modules);
    expect(next.zones[0]).toEqual(config.zones[0]);
  });

  it('falls back to the box when the outline is degenerate, and skips unusable ones', () => {
    const flat = { ...suggestion('flat'), polygon: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]] as [number, number][] };
    expect(suggestionPolygon(flat)).toEqual([
      [0.52, 0.52],
      [0.68, 0.52],
      [0.68, 0.68],
      [0.52, 0.68],
    ]);
    const empty = { ...flat, table_box: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number] };
    const { accepted } = acceptSuggestions(sampleConfig(), 'dining', [empty]);
    expect(accepted).toEqual([]);
  });
});
