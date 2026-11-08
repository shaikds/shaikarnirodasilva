// Step 2: pair the edge with the cloud (`POST /local/pair`) using the code from the dashboard
// (Settings › Devices). Optional: "local-only" mode keeps everything on the LAN.
import { Badge, Button, TextField, useTranslation } from '@rv/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Cloud, CloudOff, Link2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocalApi } from '../../api/context';
import { ServerErrors } from '../../components/ServerErrors';
import type { StepProps } from './SetupLayout';
import { CONFIG_KEY, SETUP_STATUS_KEY, useSetup } from './setupState';

const CODE_MAX = 16;

export function PairStep({ onDone }: StepProps) {
  const { t } = useTranslation();
  const api = useLocalApi();
  const ctx = useSetup();
  const qc = useQueryClient();
  const status = ctx.status;
  const [cloudUrl, setCloudUrl] = useState(status?.cloud_url ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<{ url?: string; code?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: typeof fieldErrors = {};
    const url = cloudUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/\S+$/i.test(url)) errors.url = t('pair.urlInvalid');
    if (!code.trim()) errors.code = t('pair.codeRequired');
    setFieldErrors(errors);
    if (errors.url || errors.code) return;
    setBusy(true);
    setError(null);
    try {
      await api.pair({ code: code.trim().toUpperCase(), cloud_url: url });
      setCode('');
      ctx.setPairSkipped(false);
      await qc.invalidateQueries({ queryKey: SETUP_STATUS_KEY });
      // The edge now fetches the site's config from the cloud.
      void qc.invalidateQueries({ queryKey: CONFIG_KEY });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      {status?.paired ? (
        <div className="flex flex-col gap-2 rounded-xl border border-success/40 bg-success-soft p-4">
          <p className="flex items-center gap-2 font-semibold text-success">
            <Cloud aria-hidden="true" className="h-5 w-5" />
            {t('pair.paired')}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t('pair.site')}</dt>
            <dd className="rv-num font-medium">{status.site_id}</dd>
            <dt className="text-muted">{t('pair.device')}</dt>
            <dd className="rv-num font-medium">{status.device_id}</dd>
            <dt className="text-muted">{t('pair.cloud')}</dt>
            <dd className="break-all" dir="ltr">
              {status.cloud_url}{' '}
              <Badge tone={status.cloud_online ? 'success' : 'warning'}>
                {status.cloud_online ? t('pair.online') : t('pair.offline')}
              </Badge>
            </dd>
          </dl>
          {status.last_sync_error && (
            <p className="text-xs text-warning" dir="auto">
              {t('pair.lastError', { error: status.last_sync_error })}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="flex max-w-lg flex-col gap-4" noValidate>
          <TextField
            label={t('pair.cloudUrl')}
            type="url"
            inputMode="url"
            dir="ltr"
            autoComplete="url"
            placeholder="https://app.example.com"
            value={cloudUrl}
            onChange={(e) => setCloudUrl(e.target.value)}
            error={fieldErrors.url}
            hint={t('pair.cloudUrlHint')}
          />
          <TextField
            label={t('pair.code')}
            dir="ltr"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={CODE_MAX}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={fieldErrors.code}
            hint={t('pair.codeHint')}
            className="text-lg tracking-[0.3em]"
          />
          {error != null && <ServerErrors error={error} title={t('pair.failed')} />}
          <div>
            <Button type="submit" size="lg" loading={busy}>
              <Link2 aria-hidden="true" className="h-4 w-4" />
              {t('pair.submit')}
            </Button>
          </div>
        </form>
      )}
      <aside className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="mb-1 flex items-center gap-2 font-semibold">
          <CloudOff aria-hidden="true" className="h-4 w-4 text-muted" />
          {t('pair.localOnlyTitle')}
        </p>
        <p className="text-muted">{t('pair.localOnlyBody')}</p>
        {ctx.pairSkipped && !status?.paired && (
          <p className="mt-2 font-medium text-info">{t('pair.skipped')}</p>
        )}
      </aside>
    </div>
  );
}
