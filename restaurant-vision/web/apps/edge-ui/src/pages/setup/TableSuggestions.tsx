// Zones step: automatic table suggestions per camera. The edge proposes table outlines; the
// installer accepts them one by one or all at once (each becomes a numbered Table plus a primary
// table zone that is then edited like any drawn polygon) or rejects them.
import { Badge, Button, Card, TextField, useTranslation, type SiteConfig, type Table } from '@rv/shared';
import { Check, ScanSearch, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useLocalApi } from '../../api/LocalApiProvider';
import type { SuggestNote, TableSuggestion } from '../../api/types';
import { ServerErrors } from '../../components/ServerErrors';
import type { SuggestionShape } from '../../components/ZoneCanvas';
import { acceptSuggestions, confidencePct, seatsFromEstimate, suggestionPolygon, type Accepted } from '../../lib/suggestions';
import { LABEL_MAX, SEATS_MAX, SEATS_MIN } from '../../lib/validation';

interface CameraSuggestions {
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

/** The prominent "Auto-detect tables" button, its hint and what the edge said. */
export function AutoDetectBar({ state }: { state: TableSuggestionsState }) {
  const { t } = useTranslation();
  const { result } = state;
  return (
    <section aria-labelledby="autodetect-title" className="rounded-xl border border-primary/30 bg-primary-soft p-3">
      <h3 id="autodetect-title" className="sr-only">
        {t('suggest.title')}
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => void state.detect()} loading={state.loading}>
          <ScanSearch aria-hidden="true" className="h-5 w-5" />
          {t('suggest.button')}
        </Button>
        <p className="min-w-[12rem] flex-1 text-sm text-fg">{t('suggest.hint')}</p>
      </div>
      <div aria-live="polite">
        {state.error != null && (
          <div className="mt-3">
            <ServerErrors error={state.error} title={t('suggest.failed')} onDismiss={state.clearError} />
          </div>
        )}
        {result && !state.loading && (
          <div className="mt-3 flex flex-col gap-1 text-sm">
            {result.note && (
              <p className="rounded-lg bg-surface px-3 py-2 text-fg" data-testid="suggest-note">
                {t(`suggest.note.${result.note}`)}
              </p>
            )}
            {result.suggestions.length > 0 ? (
              <p className="font-medium text-primary">{t('suggest.found', { count: result.suggestions.length })}</p>
            ) : (
              state.accepted.length === 0 && (
                <p className="rounded-lg bg-surface px-3 py-2 text-fg" data-testid="suggest-none">
                  {result.note ? t('suggest.noneWithNote') : t('suggest.none')}
                </p>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Pending suggestions (accept / reject) and the tables just created from them (editable). */
export function SuggestionsPanel({
  state,
  tables,
  onEditTable,
  onSelectZone,
}: {
  state: TableSuggestionsState;
  tables: readonly Table[];
  onEditTable: (tableId: string, patch: Partial<Table>) => void;
  onSelectZone: (zoneId: string) => void;
}) {
  const { t } = useTranslation();
  const pending = state.result?.suggestions ?? [];
  const accepted = state.accepted
    .map((a) => ({ a, table: tables.find((tb) => tb.table_id === a.tableId) }))
    .filter((x): x is { a: Accepted; table: Table } => !!x.table);
  if (pending.length === 0 && accepted.length === 0) return null;

  return (
    <Card title={t('suggest.panelTitle')} level={3} padded={false}>
      {pending.length > 0 && (
        <div className="border-b border-border">
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            <Button size="sm" onClick={() => state.accept(pending.map((s) => s.suggestion_id))}>
              <Check aria-hidden="true" className="h-4 w-4" />
              {t('suggest.acceptAll', { count: pending.length })}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => state.reject(pending.map((s) => s.suggestion_id))}>
              {t('suggest.rejectAll')}
            </Button>
          </div>
          <ul className="divide-y divide-border" aria-label={t('suggest.pendingLabel')}>
            {pending.map((s, i) => {
              const pct = confidencePct(s.confidence);
              const name = t('suggest.itemName', { n: i + 1 });
              return (
                <li
                  key={s.suggestion_id}
                  data-testid={`suggestion-${s.suggestion_id}`}
                  className={state.active === s.suggestion_id ? 'bg-primary-soft' : undefined}
                >
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <button
                      type="button"
                      className="min-h-tap min-w-0 flex-1 text-start text-sm"
                      aria-pressed={state.active === s.suggestion_id}
                      onClick={() => state.setActive(state.active === s.suggestion_id ? null : s.suggestion_id)}
                    >
                      <span className="font-medium">{name}</span>{' '}
                      <span className="text-muted">· {t('suggest.seatsEst', { count: seatsFromEstimate(s.seats_est) })}</span>
                    </button>
                    <Badge tone={pct >= 60 ? 'success' : pct >= 40 ? 'warning' : 'neutral'}>
                      {t('suggest.confidence', { pct })}
                    </Badge>
                    <Button size="sm" variant="secondary" onClick={() => state.accept([s.suggestion_id])} aria-label={t('suggest.acceptNamed', { name })}>
                      <Check aria-hidden="true" className="h-4 w-4" />
                      {t('suggest.accept')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => state.reject([s.suggestion_id])} aria-label={t('suggest.rejectNamed', { name })}>
                      <X aria-hidden="true" className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">{t('suggest.reject')}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {accepted.length > 0 && (
        <div className="px-4 py-3">
          <p className="mb-2 text-sm font-medium">{t('suggest.addedTitle', { count: accepted.length })}</p>
          <ul className="flex flex-col gap-2" aria-label={t('suggest.addedTitle', { count: accepted.length })}>
            {accepted.map(({ a, table }) => (
              <li key={a.tableId} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-2">
                <TextField
                  label={t('tables.label')}
                  value={table.label}
                  maxLength={LABEL_MAX}
                  dir="auto"
                  onChange={(e) => onEditTable(table.table_id, { label: e.target.value })}
                  aria-label={t('suggest.labelFor', { label: table.label })}
                />
                <TextField
                  label={t('tables.seats')}
                  type="number"
                  inputMode="numeric"
                  min={SEATS_MIN}
                  max={SEATS_MAX}
                  value={table.seats > 0 ? String(table.seats) : ''}
                  onChange={(e) => onEditTable(table.table_id, { seats: Math.floor(Number(e.target.value) || 0) })}
                  aria-label={t('suggest.seatsFor', { label: table.label })}
                />
                <Button size="sm" variant="ghost" onClick={() => onSelectZone(a.zoneId)} className="mb-1">
                  {t('suggest.editShape')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
