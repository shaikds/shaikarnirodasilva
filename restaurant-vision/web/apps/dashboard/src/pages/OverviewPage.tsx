import {
  Badge,
  Button,
  Card,
  CURRENCIES,
  EmptyState,
  EstimateBadge,
  LoadingBlock,
  PageHeader,
  SelectField,
  TextField,
  buttonClass,
  useBranchComparison,
  useCreateSite,
  useMe,
  useSites,
  useTranslation,
  type Currency,
  type MetricsSummary,
  type SiteSummary,
} from '@rv/shared';
import { Bell, Cpu, Plus, Store, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RangePicker } from '../components/RangePicker';
import { useRange, type RangeKey } from '../lib/range';
import { TIMEZONES } from '../lib/timezones';
import { useFmt } from '../lib/useFmt';

function SiteCard({ site }: { site: SiteSummary }) {
  const { t } = useTranslation();
  const f = useFmt();
  return (
    <Card
      title={site.name}
      level={3}
      actions={
        site.edge_online ? (
          <Badge tone="success">
            <Cpu aria-hidden="true" className="h-3.5 w-3.5" />
            {t('overview.edge')}: {t('overview.edgeOnline')}
          </Badge>
        ) : (
          <Badge tone="danger">
            <Cpu aria-hidden="true" className="h-3.5 w-3.5" />
            {t('overview.edge')}: {t('overview.edgeOffline')}
          </Badge>
        )
      }
    >
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted">
            <Users aria-hidden="true" className="h-3.5 w-3.5" />
            {t('overview.guestsNow')}
          </dt>
          <dd className="text-2xl font-semibold">{site.guests === null ? t('overview.noData') : f.number(site.guests)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted">
            <Bell aria-hidden="true" className="h-3.5 w-3.5" />
            {t('overview.openAlerts')}
          </dt>
          <dd className={site.open_alerts > 0 ? 'text-2xl font-semibold text-warning' : 'text-2xl font-semibold'}>
            {f.number(site.open_alerts)}
          </dd>
        </div>
      </dl>
      <Link to={`/sites/${site.site_id}/live`} className={buttonClass('secondary', 'sm', 'mt-4 w-full')}>
        {t('overview.openLive')}
      </Link>
    </Card>
  );
}

function CompareTable({ rows, names }: { rows: MetricsSummary[]; names: Map<string, string> }) {
  const { t } = useTranslation();
  const f = useFmt();
  const th = 'whitespace-nowrap px-3 py-2 text-start text-xs font-semibold text-muted';
  const td = 'whitespace-nowrap px-3 py-2 text-sm';
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse">
        <caption className="sr-only">{t('overview.compareTitle')}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={th}>{t('overview.columns.site')}</th>
            <th scope="col" className={th}>{t('overview.columns.guests')}</th>
            <th scope="col" className={th}>{t('overview.columns.sessions')}</th>
            <th scope="col" className={th}>{t('overview.columns.avgDwell')}</th>
            <th scope="col" className={th}>{t('overview.columns.turnover')}</th>
            <th scope="col" className={th}>{t('overview.columns.responseP50')}</th>
            <th scope="col" className={th}>{t('overview.columns.queueWait')}</th>
            <th scope="col" className={th}>{t('overview.columns.walkaways')}</th>
            <th scope="col" className={th}>
              <span className="inline-flex items-center gap-1">
                {t('overview.columns.lostRevenue')} <EstimateBadge />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.site_id} className="border-b border-border last:border-0">
              <th scope="row" className={`${td} text-start font-medium`}>
                <Link to={`/sites/${r.site_id}/analytics`} className="text-primary hover:underline">
                  {names.get(r.site_id) ?? r.site_id}
                </Link>
              </th>
              <td className={td}>{f.num(r.guests_served)}</td>
              <td className={td}>{f.num(r.sessions)}</td>
              <td className={td}>{f.dur(r.avg_dwell_s)}</td>
              <td className={td}>{f.num(r.turnover_per_table, 1)}</td>
              <td className={td}>{f.dur(r.waiter_response_p50_s)}</td>
              <td className={td}>{f.dur(r.queue_avg_wait_s)}</td>
              <td className={td}>{f.num(r.walkaways)}</td>
              <td className={td}>{f.money(r.lost_revenue.value, r.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewSiteForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateSite(orgId);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState<string>('Asia/Jerusalem');
  const [currency, setCurrency] = useState<Currency>('ILS');
  const [avgCheck, setAvgCheck] = useState('120');
  const [touched, setTouched] = useState(false);
  const nameError = touched && !name.trim() ? t('auth.errors.required') : undefined;
  const checkNum = Number(avgCheck);
  const checkError = touched && (!Number.isFinite(checkNum) || checkNum < 0) ? t('settings.thresholds.errors.positive') : undefined;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !Number.isFinite(checkNum) || checkNum < 0) return;
    create.mutate(
      { name: name.trim(), timezone, locale: 'he', currency, avg_check_per_guest: checkNum },
      {
        onSuccess: (site) => {
          onDone();
          navigate(`/sites/${site.site_id}/settings`);
        },
      },
    );
  };

  return (
    <Card title={t('overview.newSite.title')} className="mb-6">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField label={t('overview.newSite.name')} value={name} onChange={(e) => setName(e.target.value)} error={nameError} required maxLength={64} />
        <SelectField label={t('overview.newSite.timezone')} value={timezone} onChange={(e) => setTimezone(e.target.value)} dir="ltr">
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('overview.newSite.currency')} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('overview.newSite.avgCheck')}
          type="number"
          inputMode="decimal"
          min={0}
          value={avgCheck}
          onChange={(e) => setAvgCheck(e.target.value)}
          error={checkError}
          suffix={currency}
        />
        {create.isError && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {t('common:errors.generic')}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={create.isPending}>
            {t('overview.newSite.create')}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t('common:actions.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const me = useMe();
  const orgId = me.data?.org.org_id;
  const sites = useSites(orgId, { refetchInterval: 15_000 });
  const [range, setRange] = useState<RangeKey>('today');
  const tz = sites.data?.[0]?.timezone ?? 'Asia/Jerusalem';
  const r = useRange(range, tz);
  const compare = useBranchComparison(orgId, r, (sites.data?.length ?? 0) > 0);
  const [adding, setAdding] = useState(false);
  const names = new Map((sites.data ?? []).map((s) => [s.site_id, s.name]));

  return (
    <>
      <PageHeader
        title={t('overview.title')}
        subtitle={me.data ? t('overview.subtitle', { org: me.data.org.name, count: sites.data?.length ?? 0 }) : undefined}
        actions={
          !adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t('overview.addSite')}
            </Button>
          )
        }
      />
      {adding && orgId && <NewSiteForm orgId={orgId} onDone={() => setAdding(false)} />}
      {sites.isLoading ? (
        <LoadingBlock />
      ) : !sites.data?.length ? (
        <Card>
          <EmptyState
            icon={<Store className="h-10 w-10" />}
            title={t('overview.noSites')}
            description={t('overview.noSitesBody')}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sites.data.map((s) => (
              <SiteCard key={s.site_id} site={s} />
            ))}
          </div>
          <Card
            title={t('overview.compareTitle')}
            description={t('overview.compareDesc')}
            actions={<RangePicker value={range} onChange={setRange} />}
          >
            {compare.isLoading ? <LoadingBlock /> : <CompareTable rows={compare.data?.sites ?? []} names={names} />}
          </Card>
        </>
      )}
    </>
  );
}
