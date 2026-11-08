// Step 4: tables (label, seats, section). Edits go into the draft config; Next saves them.
import { Button, Card, EmptyState, TextField, useTranslation, type Table } from '@rv/shared';
import { Plus, Trash2, Utensils } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { quickAddTables, removeTable } from '../../lib/config';
import { LABEL_MAX, SEATS_MAX, SEATS_MIN } from '../../lib/validation';
import { nextId } from '../../lib/zones';
import { IssueText } from '../../components/IssueList';
import type { StepProps } from './SetupLayout';
import { useSetup } from './setupState';

export function TablesStep(_: StepProps) {
  const { t } = useTranslation();
  const ctx = useSetup();
  const config = ctx.config!;
  const [count, setCount] = useState('8');
  const [seats, setSeats] = useState('4');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const update = (tableId: string, patch: Partial<Table>) =>
    ctx.setConfig((c) => ({
      ...c,
      tables: c.tables.map((tb) => (tb.table_id === tableId ? { ...tb, ...patch } : tb)),
    }));

  const addOne = () =>
    ctx.setConfig((c) => {
      const [table] = quickAddTables(c, 1, 4);
      return { ...c, tables: [...c.tables, table ?? { table_id: nextId('t', []), label: '1', seats: 4, section: null }] };
    });

  const quickAdd = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.min(100, Math.max(1, Math.floor(Number(count) || 0)));
    const s = Math.min(SEATS_MAX, Math.max(SEATS_MIN, Math.floor(Number(seats) || 0)));
    ctx.setConfig((c) => ({ ...c, tables: [...c.tables, ...quickAddTables(c, n, s)] }));
  };

  const remove = (tableId: string) => {
    ctx.setConfig((c) => removeTable(c, tableId));
    setConfirmDelete(null);
  };

  const issuesFor = (tableId: string) =>
    ctx.issues.filter((i) => i.entity === 'table' && i.id === tableId && i.severity === 'error');

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={quickAdd} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4" aria-label={t('tables.quickAdd')}>
        <TextField
          label={t('tables.quickCount')}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          containerClassName="w-32"
        />
        <TextField
          label={t('tables.quickSeats')}
          type="number"
          inputMode="numeric"
          min={SEATS_MIN}
          max={SEATS_MAX}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          containerClassName="w-32"
        />
        <Button type="submit" variant="secondary">
          {t('tables.quickAdd')}
        </Button>
        <Button onClick={addOne} className="ms-auto">
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t('tables.add')}
        </Button>
      </form>

      {config.tables.length === 0 ? (
        <EmptyState icon={<Utensils className="h-10 w-10" />} title={t('tables.none')} description={t('tables.noneBody')} />
      ) : (
        <Card title={t('tables.listTitle', { count: config.tables.length })} padded={false}>
          <ul className="divide-y divide-border" aria-label={t('tables.listLabel')}>
            {config.tables.map((tb, index) => {
              const zoneCount = config.zones.filter((z) => z.table_id === tb.table_id).length;
              const issues = issuesFor(tb.table_id);
              return (
                <li key={tb.table_id} className="p-3 sm:px-4">
                  <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
                    <TextField
                      label={t('tables.label')}
                      value={tb.label}
                      maxLength={LABEL_MAX}
                      dir="auto"
                      onChange={(e) => update(tb.table_id, { label: e.target.value })}
                      aria-label={t('tables.labelFor', { n: index + 1 })}
                    />
                    <TextField
                      label={t('tables.seats')}
                      type="number"
                      inputMode="numeric"
                      min={SEATS_MIN}
                      max={SEATS_MAX}
                      value={tb.seats > 0 ? String(tb.seats) : ''}
                      onChange={(e) => update(tb.table_id, { seats: Math.floor(Number(e.target.value) || 0) })}
                      aria-label={t('tables.seatsFor', { label: tb.label || index + 1 })}
                    />
                    <TextField
                      label={t('tables.section')}
                      placeholder={t('tables.sectionPlaceholder')}
                      value={tb.section ?? ''}
                      maxLength={LABEL_MAX}
                      dir="auto"
                      onChange={(e) => update(tb.table_id, { section: e.target.value === '' ? null : e.target.value })}
                      aria-label={t('tables.sectionFor', { label: tb.label || index + 1 })}
                      containerClassName="col-span-2 sm:col-span-1"
                    />
                    <div className="col-span-2 flex items-end justify-end sm:col-span-1 sm:h-full">
                      <Button
                        variant="ghost"
                        className="text-danger"
                        onClick={() => (zoneCount > 0 ? setConfirmDelete(tb.table_id) : remove(tb.table_id))}
                        aria-label={t('tables.deleteNamed', { label: tb.label || tb.table_id })}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        <span className="sm:sr-only">{t('common:actions.delete')}</span>
                      </Button>
                    </div>
                  </div>
                  {issues.length > 0 && (
                    <ul className="mt-2 text-sm text-danger">
                      {issues.map((i, k) => (
                        <li key={k}>
                          <IssueText issue={i} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {confirmDelete === tb.table_id && (
                    <div role="alertdialog" aria-labelledby={`tdel-${tb.table_id}`} className="mt-2 rounded-lg border border-danger/40 bg-danger-soft p-3">
                      <p id={`tdel-${tb.table_id}`} className="text-sm font-medium">
                        {t('tables.confirmDelete', { label: tb.label, count: zoneCount })}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button variant="danger" size="sm" onClick={() => remove(tb.table_id)}>
                          {t('common:actions.delete')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
                          {t('common:actions.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
