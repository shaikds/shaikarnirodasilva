// Suggestions per camera from `POST /local/cameras/{id}/suggest-tables`, plus accept / reject.
import type { SiteConfig } from '@rv/shared';
import { useCallback, useState } from 'react';
import { useLocalApi } from '../../api/context';
import type { SuggestNote, TableSuggestion } from '../../api/types';
import type { SuggestionShape } from '../../components/ZoneCanvas';
import {
  acceptSuggestions,
  confidencePct,
  seatsFromEstimate,
  suggestionPolygon,
  type Accepted,
} from '../../lib/suggestions';

export interface CameraSuggestions {
  suggestions: TableSuggestion[];
  note: SuggestNote | null;
}

export interface TableSuggestionsState {
  loading: boolean;
  error: unknown;
  /** Result of the last run on this camera (null: never run). */
  result: CameraSuggestions | null;
  accepted: Accepted[];
  active: string | null;
  setActive: (id: string | null) => void;
  detect: () => Promise<void>;
  accept: (ids: string[]) => Accepted[];
  reject: (ids: string[]) => void;
  clearError: () => void;
  shapes: (t: (key: string, o?: Record<string, unknown>) => string) => SuggestionShape[];
}

/** Suggestions per camera, kept while the zones step is open. */
export function useTableSuggestions(
  cameraId: string,
  config: SiteConfig,
  setConfig: (update: (c: SiteConfig) => SiteConfig) => void,
): TableSuggestionsState {
  const api = useLocalApi();
  const [byCamera, setByCamera] = useState<Record<string, CameraSuggestions>>({});
  const [accepted, setAccepted] = useState<Record<string, Accepted[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [active, setActive] = useState<string | null>(null);
  const result = byCamera[cameraId] ?? null;

  const detect = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActive(null);
    try {
      const res = await api.suggestTables(cameraId);
      setByCamera((m) => ({ ...m, [cameraId]: { suggestions: res.suggestions ?? [], note: res.note ?? null } }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [api, cameraId]);

  const drop = (ids: readonly string[]) =>
    setByCamera((m) => {
      const cur = m[cameraId];
      if (!cur) return m;
      return { ...m, [cameraId]: { ...cur, suggestions: cur.suggestions.filter((s) => !ids.includes(s.suggestion_id)) } };
    });

  const accept = (ids: string[]): Accepted[] => {
    const chosen = (result?.suggestions ?? []).filter((s) => ids.includes(s.suggestion_id));
    if (chosen.length === 0) return [];
    const out = acceptSuggestions(config, cameraId, chosen);
    setConfig(() => out.config);
    setAccepted((m) => ({ ...m, [cameraId]: [...(m[cameraId] ?? []), ...out.accepted] }));
    drop(chosen.map((s) => s.suggestion_id));
    setActive(null);
    return out.accepted;
  };

  const reject = (ids: string[]) => {
    drop(ids);
    setActive(null);
  };

  const shapes = (t: (key: string, o?: Record<string, unknown>) => string): SuggestionShape[] =>
    (result?.suggestions ?? []).flatMap((s, i) => {
      const polygon = suggestionPolygon(s);
      if (!polygon) return [];
      const pct = confidencePct(s.confidence);
      return [
        {
          id: s.suggestion_id,
          polygon,
          badge: `${pct}%`,
          label: t('suggest.itemLabel', { n: i + 1, pct, seats: seatsFromEstimate(s.seats_est) }),
        },
      ];
    });

  return {
    loading,
    error,
    result,
    accepted: accepted[cameraId] ?? [],
    active,
    setActive,
    detect,
    accept,
    reject,
    clearError: () => setError(null),
    shapes,
  };
}
