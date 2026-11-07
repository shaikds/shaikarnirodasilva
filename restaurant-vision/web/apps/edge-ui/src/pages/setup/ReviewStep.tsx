// Step 8: review & save. Client-side validation mirrors the edge's rules; the full SiteConfig is
// saved with `PUT /local/config` (thresholds, modules, timezone pass through untouched). Server
// validation errors are shown by the wizard frame.
import { Badge, Button, buttonClass, Card, useTranslation, type ZoneKind } from '@rv/shared';
import { CircleCheck, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IssueList } from '../../components/IssueList';
import { errorsOf, type Issue } from '../../lib/validation';
import { ZONE_KINDS } from '../../lib/zones';
import type { StepProps } from './SetupLayout';
import { useSetup } from './SetupContext';

const FIX_STEP: Record<Issue['entity'], string> = {
  site: 'review',
  camera: 'cameras',
  table: 'tables',
  zone: 'zones',
};

export function ReviewStep(_: StepProps) {
  const { t } = useTranslation();
  const ctx = useSetup();
  const config = ctx.config!;
  const errors = errorsOf(ctx.issues);
  const warnings = ctx.issues.filter((i) => i.severity === 'warning');
  const byKind = (kind: ZoneKind) => config.zones.filter((z) => z.kind === kind).length;

  const fixLink = (issue: Issue) => {
    const step = issue.code === 'multiplePrimary' ? 'zones' : FIX_STEP[issue.entity];
    if (step === 'review') return null;
    return (
      <Link to={`/setup/${step}`} className={buttonClass('ghost', 'sm', 'shrink-0')}>
        {t('review.fix')}
      </Link>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('review.summary')} level={3}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{t('review.site')}</dt>
          <dd className="rv-num">{config.site_id}</dd>
          <dt className="text-muted">{t('review.timezone')}</dt>
          <dd className="rv-num">{config.timezone}</dd>
          <dt className="text-muted">{t('review.cameras')}</dt>
          <dd>
            <span className="rv-num">{config.cameras.length}</span>
            {config.cameras.length > 0 && (
              <span className="text-muted" dir="auto">
                {' '}
                · {config.cameras.map((c) => c.name).join(', ')}
              </span>
            )}
          </dd>
          <dt className="text-muted">{t('review.tables')}</dt>
          <dd className="rv-num">{config.tables.length}</dd>
          <dt className="text-muted">{t('review.zones')}</dt>
          <dd className="flex flex-wrap gap-1">
            {ZONE_KINDS.filter((k) => byKind(k) > 0).map((k) => (
              <Badge key={k}>
                {t(`zoneKind.${k}`)}: <span className="rv-num">{byKind(k)}</span>
              </Badge>
            ))}
            {config.zones.length === 0 && <span className="text-muted">0</span>}
          </dd>
          <dt className="text-muted">{t('review.kept')}</dt>
          <dd className="text-muted">{t('review.keptBody')}</dd>
          <dt className="text-muted">{t('review.version')}</dt>
          <dd>
            <span className="rv-num">{ctx.serverConfig?.config_version ?? 0}</span>{' '}
            {ctx.dirty ? <Badge tone="warning">{t('review.unsaved')}</Badge> : ctx.serverConfig && <Badge tone="success">{t('review.saved')}</Badge>}
          </dd>
        </dl>
      </Card>

      <Card title={t('review.checks')} level={3}>
        {errors.length === 0 && warnings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CircleCheck aria-hidden="true" className="h-5 w-5" />
            {t('review.allGood')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {errors.length > 0 && (
              <section aria-labelledby="review-errors">
                <h4 id="review-errors" className="mb-1 text-sm font-semibold text-danger">
                  {t('review.errors', { count: errors.length })}
                </h4>
                <IssueList issues={errors} action={fixLink} />
              </section>
            )}
            {warnings.length > 0 && (
              <section aria-labelledby="review-warnings">
                <h4 id="review-warnings" className="mb-1 text-sm font-semibold text-warning">
                  {t('review.warnings', { count: warnings.length })}
                </h4>
                <IssueList issues={warnings} action={fixLink} />
              </section>
            )}
          </div>
        )}
        <div className="mt-4">
          <Button onClick={() => void ctx.save()} loading={ctx.saving} disabled={errors.length > 0 || !ctx.dirty}>
            <Save aria-hidden="true" className="h-4 w-4" />
            {ctx.dirty ? t('review.save') : t('review.savedButton')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
