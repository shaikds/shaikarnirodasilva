import {
  Badge,
  Button,
  Card,
  CURRENCIES,
  DEFAULT_THRESHOLDS,
  SelectField,
  Switch,
  TextField,
  isApiError,
  isDeviceOnline,
  useCreatePairingCode,
  useDevices,
  useNow,
  useUpdateSite,
  useTranslation,
  type Currency,
  type Locale,
  type Modules,
  type Plan,
  type SiteSettings,
} from '@rv/shared';
import { Check, Copy, KeyRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  THRESHOLD_GROUPS,
  toThresholds,
  toValues,
  validateThresholds,
  type ThresholdKey,
  type ThresholdValues,
} from '../lib/thresholds';
import { TIMEZONES } from '../lib/timezones';
import { useFmt } from '../lib/useFmt';

/** Save button + status line shared by the forms. */
function SaveBar({
  pending,
  saved,
  error,
  extra,
}: {
  pending: boolean;
  saved: boolean;
  error: unknown;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <Button type="submit" loading={pending}>
        {t('common:actions.save')}
      </Button>
      {extra}
      <span role="status" className="text-sm">
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-success">
            <Check aria-hidden="true" className="h-4 w-4" />
            {t('settings.saved')}
          </span>
        )}
        {error != null && !pending && (
          <span className="text-danger">
            {t('settings.saveFailed', {
              message: isApiError(error) ? error.message : t('common:errors.generic'),
            })}
          </span>
        )}
      </span>
    </div>
  );
}

export function DetailsForm({ site }: { site: SiteSettings }) {
  const { t } = useTranslation();
  const update = useUpdateSite(site.site_id);
  const [form, setForm] = useState({
    name: site.name,
    timezone: site.timezone,
    locale: site.locale,
    currency: site.currency,
    avg: String(site.avg_check_per_guest),
  });
  const [saved, setSaved] = useState(false);
  const avg = Number(form.avg);
  const errors = {
    name: !form.name.trim() ? t('auth.errors.required') : undefined,
    avg:
      form.avg.trim() === '' || !Number.isFinite(avg) || avg < 0
        ? t('settings.thresholds.errors.positive')
        : undefined,
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (errors.name || errors.avg) return;
    setSaved(false);
    update.mutate(
      {
        name: form.name.trim(),
        timezone: form.timezone,
        locale: form.locale,
        currency: form.currency,
        avg_check_per_guest: avg,
      },
      { onSuccess: () => setSaved(true) },
    );
  };
  return (
    <Card>
      <form
        onSubmit={onSubmit}
        noValidate
        className="grid grid-cols-1 max-w-2xl gap-4 sm:grid-cols-2"
      >
        <TextField
          label={t('settings.details.name')}
          value={form.name}
          maxLength={64}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
        />
        <SelectField
          label={t('settings.details.timezone')}
          dir="ltr"
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        >
          {[...new Set([form.timezone, ...TIMEZONES])].map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('settings.details.locale')}
          value={form.locale}
          onChange={(e) => setForm({ ...form, locale: e.target.value as Locale })}
        >
          <option value="he">{t('common:lang.he')}</option>
          <option value="en">{t('common:lang.en')}</option>
        </SelectField>
        <SelectField
          label={t('settings.details.currency')}
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('settings.details.avgCheck')}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={form.avg}
          onChange={(e) => setForm({ ...form, avg: e.target.value })}
          hint={t('settings.details.avgCheckHint')}
          error={errors.avg}
          suffix={form.currency}
        />
        <div className="sm:col-span-2">
          <SaveBar pending={update.isPending} saved={saved} error={update.error} />
        </div>
      </form>
    </Card>
  );
}

export function ThresholdsForm({ site }: { site: SiteSettings }) {
  const { t } = useTranslation();
  const update = useUpdateSite(site.site_id);
  const [values, setValues] = useState<ThresholdValues>(() => toValues(site.thresholds));
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const errors = validateThresholds(values);
  const hasErrors = Object.keys(errors).length > 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setSaved(false);
    if (hasErrors) return;
    update.mutate({ thresholds: toThresholds(values) }, { onSuccess: () => setSaved(true) });
  };
  const set = (k: ThresholdKey, v: string) => {
    setSaved(false);
    setValues((cur) => ({ ...cur, [k]: v }));
  };
  const showError = (k: ThresholdKey) => {
    const err = errors[k];
    if (!err || (!submitted && values[k] === String(site.thresholds[k]))) return undefined;
    return t(err.key, err.values);
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label={t('settings.tabs.thresholds')}>
      <p className="mb-4 max-w-3xl text-sm text-muted">{t('settings.thresholds.intro')}</p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {THRESHOLD_GROUPS.map((group) => (
          <Card key={group.id} title={t(`settings.thresholds.groups.${group.id}`)} level={3}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {group.fields.map((f) => (
                <TextField
                  key={f.key}
                  name={f.key}
                  label={t(`settings.thresholds.fields.${f.key}.label`)}
                  hint={t(`settings.thresholds.fields.${f.key}.help`)}
                  type="number"
                  inputMode={f.integer ? 'numeric' : 'decimal'}
                  min={0}
                  max={f.max}
                  step={f.integer ? 1 : 'any'}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  error={showError(f.key)}
                  suffix={t(`settings.thresholds.units.${f.unit}`)}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>
      <SaveBar
        pending={update.isPending}
        saved={saved}
        error={update.error}
        extra={
          <Button variant="ghost" onClick={() => setValues(toValues(DEFAULT_THRESHOLDS))}>
            {t('settings.thresholds.reset')}
          </Button>
        }
      />
    </form>
  );
}

const MODULE_KEYS: (keyof Modules)[] = ['occupancy', 'queue', 'tables', 'alerts'];
const PRO_MODULES: (keyof Modules)[] = ['tables', 'alerts'];

export function ModulesForm({ site, plan }: { site: SiteSettings; plan: Plan }) {
  const { t } = useTranslation();
  const update = useUpdateSite(site.site_id);
  const [modules, setModules] = useState<Modules>(site.modules);
  const [saved, setSaved] = useState(false);
  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          update.mutate({ modules }, { onSuccess: () => setSaved(true) });
        }}
        className="max-w-xl"
      >
        <p className="mb-2 text-sm text-muted">{t('settings.modules.intro')}</p>
        <div className="divide-y divide-border">
          {MODULE_KEYS.map((k) => {
            const locked = plan === 'starter' && PRO_MODULES.includes(k);
            return (
              <Switch
                key={k}
                checked={modules[k] && !locked}
                disabled={locked}
                onChange={(v) => {
                  setSaved(false);
                  setModules({ ...modules, [k]: v });
                }}
                label={t(`settings.modules.${k}.label`)}
                description={
                  locked
                    ? `${t(`settings.modules.${k}.help`)} ${t('settings.modules.proOnly')}`
                    : t(`settings.modules.${k}.help`)
                }
              />
            );
          })}
        </div>
        <SaveBar pending={update.isPending} saved={saved} error={update.error} />
      </form>
    </Card>
  );
}

function PairingCode({ code, expiresAt }: { code: string; expiresAt: number }) {
  const { t } = useTranslation();
  const f = useFmt();
  const now = useNow();
  const [copied, setCopied] = useState(false);
  const cloud = typeof window !== 'undefined' ? window.location.origin : '';
  const command = `rv-edge pair --code ${code} --cloud ${cloud}`;
  const expired = now >= expiresAt;
  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary-soft p-4">
      <p className="text-sm font-medium">{t('settings.devices.codeTitle')}</p>
      <p
        className="my-2 font-mono text-3xl font-bold tracking-[0.3em]"
        dir="ltr"
        aria-live="polite"
      >
        {code}
      </p>
      {expired ? (
        <p className="text-sm text-danger">{t('settings.devices.expired')}</p>
      ) : (
        <p className="text-sm text-muted">
          {t('settings.devices.codeHelp', { time: f.relative(expiresAt, now) })}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          dir="ltr"
          className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-surface px-3 py-2 text-xs"
        >
          {command}
        </code>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(command).then(() => setCopied(true));
          }}
        >
          {copied ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Copy aria-hidden="true" className="h-4 w-4" />
          )}
          {copied ? t('common:actions.copied') : t('common:actions.copy')}
        </Button>
      </div>
    </div>
  );
}

export function DevicesTab({ siteId, canPair }: { siteId: string; canPair: boolean }) {
  const { t } = useTranslation();
  const f = useFmt();
  const now = useNow();
  const devices = useDevices(siteId);
  const pairing = useCreatePairingCode(siteId);
  const th = 'whitespace-nowrap px-3 py-2 text-start text-xs font-semibold text-muted';
  return (
    <Card>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t('settings.devices.intro')}</p>
      {(devices.data ?? []).length === 0 ? (
        <p className="text-sm">{t('live.devices.none')}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[44rem]">
            <thead>
              <tr className="border-b border-border">
                {(['device', 'status', 'version', 'lastSeen', 'cameras', 'localUrl'] as const).map(
                  (c) => (
                    <th key={c} scope="col" className={th}>
                      {t(`settings.devices.columns.${c}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {devices.data!.map((d) => {
                const online = isDeviceOnline(d, now);
                return (
                  <tr key={d.device_id} className="border-b border-border text-sm last:border-0">
                    <th scope="row" className="px-3 py-2 text-start font-medium" dir="ltr">
                      {d.device_id}
                    </th>
                    <td className="px-3 py-2">
                      <Badge tone={online ? 'success' : 'danger'}>
                        {online ? t('common:device.online') : t('common:device.offline')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{d.version ?? f.none}</td>
                    <td className="px-3 py-2">
                      {d.last_seen_at === null
                        ? t('live.devices.never')
                        : f.relative(d.last_seen_at, now)}
                    </td>
                    <td className="px-3 py-2">{f.number(d.cameras.length)}</td>
                    <td className="px-3 py-2">
                      {d.local_url ? (
                        <span
                          dir="ltr"
                          className="font-mono text-xs"
                          data-testid="device-local-url"
                        >
                          {d.local_url}
                        </span>
                      ) : (
                        f.none
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canPair && (
        <div className="mt-4">
          <Button onClick={() => pairing.mutate()} loading={pairing.isPending}>
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            {t('settings.devices.generate')}
          </Button>
          {pairing.isError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {t('common:errors.generic')}
            </p>
          )}
          {pairing.data && (
            <PairingCode code={pairing.data.code} expiresAt={pairing.data.expires_at} />
          )}
        </div>
      )}
    </Card>
  );
}
