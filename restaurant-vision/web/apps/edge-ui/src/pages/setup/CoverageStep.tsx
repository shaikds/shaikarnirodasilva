// Step 7: coverage check (`GET /local/coverage`): tables no camera counts. For each one the
// wizard says why and what to do: make an existing drawing primary, turn its camera on, draw
// it on another camera, or add a cheap ceiling (fisheye) camera above it.
import { Badge, buttonClass, Button, Card, LoadingBlock, useTranslation } from '@rv/shared';
import { useQuery } from '@tanstack/react-query';
import { Camera, CircleCheck, Lightbulb, PenLine, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocalApi } from '../../api/context';
import { ServerErrors } from '../../components/ServerErrors';
import { setPrimary } from '../../lib/zones';
import type { StepProps } from './SetupLayout';
import { COVERAGE_KEY, useSetup } from './SetupContext';

export type GapReason =
  | { kind: 'notPrimary'; zoneId: string; cameraId: string }
  | { kind: 'cameraOff'; cameraId: string }
  | { kind: 'notDrawn' };

export function CoverageStep(_: StepProps) {
  const { t } = useTranslation();
  const api = useLocalApi();
  const ctx = useSetup();
  const config = ctx.config!;
  const coverage = useQuery({
    queryKey: COVERAGE_KEY,
    queryFn: ({ signal }) => api.coverage(signal),
  });

  const cameraName = (id: string) => config.cameras.find((c) => c.camera_id === id)?.name ?? id;
  const enabled = new Set(config.cameras.filter((c) => c.enabled).map((c) => c.camera_id));

  const reasonFor = (tableId: string): GapReason => {
    const zones = config.zones.filter((z) => z.kind === 'table' && z.table_id === tableId);
    const primary = zones.find((z) => z.primary);
    if (primary && !enabled.has(primary.camera_id)) return { kind: 'cameraOff', cameraId: primary.camera_id };
    const candidate = zones.find((z) => enabled.has(z.camera_id));
    if (candidate) return { kind: 'notPrimary', zoneId: candidate.zone_id, cameraId: candidate.camera_id };
    return { kind: 'notDrawn' };
  };

  const fixPrimary = async (zoneId: string) => {
    const next = { ...config, zones: setPrimary(config.zones, zoneId, true) };
    if (await ctx.save(next)) void coverage.refetch();
  };

  if (coverage.isLoading) return <LoadingBlock />;
  if (coverage.isError) return <ServerErrors error={coverage.error} title={t('coverage.failed')} />;

  const uncovered = coverage.data?.uncovered_table_ids ?? [];
  const tables = config.tables;
  const covered = tables.filter((tb) => !uncovered.includes(tb.table_id));

  return (
    <div className="flex flex-col gap-4">
      {ctx.dirty && (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {t('coverage.unsaved')}
        </p>
      )}
      <div
        className={
          uncovered.length === 0
            ? 'flex items-center gap-3 rounded-xl border border-success/40 bg-success-soft p-4'
            : 'flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4'
        }
      >
        {uncovered.length === 0 ? (
          <CircleCheck aria-hidden="true" className="h-6 w-6 shrink-0 text-success" />
        ) : (
          <TriangleAlert aria-hidden="true" className="h-6 w-6 shrink-0 text-warning" />
        )}
        <p className="font-semibold">
          {uncovered.length === 0
            ? t('coverage.allCovered', { count: tables.length })
            : t('coverage.summary', { covered: covered.length, total: tables.length })}
        </p>
      </div>

      {uncovered.length > 0 && (
        <>
          <Card title={t('coverage.uncoveredTitle', { count: uncovered.length })} padded={false}>
            <ul className="divide-y divide-border" aria-label={t('coverage.uncoveredTitle', { count: uncovered.length })}>
              {uncovered.map((tableId) => {
                const table = tables.find((tb) => tb.table_id === tableId);
                const reason = reasonFor(tableId);
                return (
                  <li key={tableId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold" dir="auto">
                        {t('common:table.name', { label: table?.label ?? tableId })}
                        {table?.section && <span className="font-normal text-muted"> · {table.section}</span>}
                      </p>
                      <p className="text-sm text-muted">
                        {reason.kind === 'notPrimary'
                          ? t('coverage.reason.notPrimary', { camera: cameraName(reason.cameraId) })
                          : reason.kind === 'cameraOff'
                            ? t('coverage.reason.cameraOff', { camera: cameraName(reason.cameraId) })
                            : t('coverage.reason.notDrawn')}
                      </p>
                    </div>
                    {reason.kind === 'notPrimary' ? (
                      <Button size="sm" onClick={() => void fixPrimary(reason.zoneId)} loading={ctx.saving}>
                        {t('coverage.makePrimary', { camera: cameraName(reason.cameraId) })}
                      </Button>
                    ) : (
                      <Badge tone="warning">{t('coverage.notCounted')}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <section aria-labelledby="coverage-reco" className="rounded-xl border border-info/40 bg-info-soft p-4">
            <h3 id="coverage-reco" className="mb-2 flex items-center gap-2 font-semibold text-info">
              <Lightbulb aria-hidden="true" className="h-5 w-5" />
              {t('coverage.recoTitle')}
            </h3>
            <ol className="list-decimal space-y-2 ps-5 text-sm text-fg">
              <li>
                <strong>{t('coverage.recoCeilingTitle')}</strong> {t('coverage.recoCeilingBody')}
              </li>
              <li>
                <strong>{t('coverage.recoOtherTitle')}</strong> {t('coverage.recoOtherBody')}
              </li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/setup/zones" className={buttonClass('secondary', 'sm')}>
                <PenLine aria-hidden="true" className="h-4 w-4" />
                {t('coverage.goZones')}
              </Link>
              <Link to="/setup/cameras" className={buttonClass('secondary', 'sm')}>
                <Camera aria-hidden="true" className="h-4 w-4" />
                {t('coverage.goCameras')}
              </Link>
            </div>
          </section>
        </>
      )}

      {covered.length > 0 && (
        <Card title={t('coverage.coveredTitle', { count: covered.length })} level={3}>
          <ul className="flex flex-wrap gap-2">
            {covered.map((tb) => {
              const zone = config.zones.find((z) => z.table_id === tb.table_id && z.primary);
              return (
                <li key={tb.table_id}>
                  <Badge tone="success">
                    <span dir="auto">{t('common:table.name', { label: tb.label })}</span>
                    {zone && <span className="font-normal">· {cameraName(zone.camera_id)}</span>}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
