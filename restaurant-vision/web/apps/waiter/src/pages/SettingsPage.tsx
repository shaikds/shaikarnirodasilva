import {
  Button,
  Card,
  Switch,
  TextField,
  ThemeToggle,
  LanguageSwitcher,
  buttonClass,
  useApi,
  useLogout,
  useTranslation,
} from '@rv/shared';
import { ArrowLeft, ArrowRight, BellRing, Check, LogOut } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { PushError, disablePush, enablePush, pushPermission, type PushState } from '../lib/push';
import { useEdgeUrl } from '../lib/edgeUrl';
import { isValidEdgeUrl, useWaiterSettings } from '../lib/settings';
import { playAlertSound, vibrate } from '../lib/sound';
import { useWaiterSite } from '../lib/useSite';

function NotificationsSetting({ siteId }: { siteId: string | undefined }) {
  const { t } = useTranslation();
  const api = useApi();
  const subscriptionId = useWaiterSettings((s) => s.pushSubscriptionId);
  const setSubscriptionId = useWaiterSettings((s) => s.setPushSubscriptionId);
  const [state, setState] = useState<PushState>(() => pushPermission());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    if (!siteId) return;
    setBusy(true);
    setError(null);
    try {
      setSubscriptionId(await enablePush(api, siteId));
    } catch (e) {
      const reason = e instanceof PushError ? e.reason : 'failed';
      setError(
        reason === 'denied'
          ? t('settings.denied')
          : reason === 'unsupported'
            ? t('settings.unsupported')
            : t('settings.failed'),
      );
    } finally {
      setState(pushPermission());
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    await disablePush(api, subscriptionId);
    setSubscriptionId(null);
    setBusy(false);
  };

  return (
    <div className="py-2">
      <p className="text-sm font-medium">{t('settings.notifications')}</p>
      <p className="mb-2 text-xs text-muted">{t('settings.notificationsHelp')}</p>
      {state === 'unsupported' ? (
        <p className="text-sm text-muted">{t('settings.unsupported')}</p>
      ) : state === 'denied' ? (
        <p className="text-sm text-danger">{t('settings.denied')}</p>
      ) : subscriptionId && state === 'granted' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-1 text-sm text-success">
            <Check aria-hidden="true" className="h-4 w-4" />
            {t('settings.enabled')}
          </p>
          <Button variant="ghost" size="sm" loading={busy} onClick={() => void disable()}>
            {t('settings.disable')}
          </Button>
        </div>
      ) : (
        <Button size="lg" loading={busy} onClick={() => void enable()}>
          <BellRing aria-hidden="true" className="h-5 w-5" />
          {t('settings.enable')}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function EdgeUrlSetting({ siteId }: { siteId: string | undefined }) {
  const { t } = useTranslation();
  const edge = useEdgeUrl(siteId);
  const setEdgeUrl = useWaiterSettings((s) => s.setEdgeUrl);
  const [value, setValue] = useState(edge.url);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Follow the automatic address (it arrives with the device list) until the user types.
  useEffect(() => {
    if (!dirty) setValue(edge.url);
  }, [edge.url, dirty]);
  const invalid = !isValidEdgeUrl(value);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    // Saving the automatic address itself keeps it automatic (it follows the edge).
    setEdgeUrl(value.trim() === edge.automatic ? null : value);
    setDirty(false);
    setSaved(true);
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <TextField
        label={t('settings.edgeUrl')}
        type="url"
        inputMode="url"
        dir="ltr"
        value={value}
        onChange={(e) => {
          setSaved(false);
          setDirty(true);
          setValue(e.target.value);
        }}
        hint={
          edge.source === 'manual'
            ? t('settings.edgeUrlManual', { url: edge.automatic })
            : edge.source === 'edge'
              ? t('settings.edgeUrlAuto')
              : t('settings.edgeUrlHint', { url: edge.automatic })
        }
        error={invalid ? t('settings.invalidUrl') : undefined}
        className="min-h-[52px] text-base"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={invalid}>
          {t('settings.save')}
        </Button>
        <Button
          variant="ghost"
          disabled={edge.source !== 'manual' && !dirty}
          onClick={() => {
            setEdgeUrl(null);
            setValue(edge.automatic);
            setDirty(false);
            setSaved(true);
          }}
        >
          {t('settings.reset')}
        </Button>
        <span role="status" className="text-sm text-success">
          {saved ? t('settings.saved') : ''}
        </span>
      </div>
    </form>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { site } = useWaiterSite();
  const logout = useLogout();
  const sound = useWaiterSettings((s) => s.sound);
  const vib = useWaiterSettings((s) => s.vibrate);
  const setSound = useWaiterSettings((s) => s.setSound);
  const setVibrate = useWaiterSettings((s) => s.setVibrate);
  const Back = i18n.language === 'he' ? ArrowRight : ArrowLeft;

  return (
    <Shell title={t('settings.title')}>
      <Link to="/" className={buttonClass('ghost', 'md', 'mb-3 -ms-2')}>
        <Back aria-hidden="true" className="h-4 w-4" />
        {t('settings.back')}
      </Link>
      <div className="flex flex-col gap-4">
        <Card title={t('settings.alertsSection')}>
          <div className="divide-y divide-border">
            <Switch
              checked={sound}
              onChange={setSound}
              label={t('settings.sound')}
              description={t('settings.soundHelp')}
            />
            <Switch
              checked={vib}
              onChange={setVibrate}
              label={t('settings.vibrate')}
              description={t('settings.vibrateHelp')}
            />
            <div className="py-3">
              <Button
                variant="secondary"
                onClick={() => {
                  playAlertSound(false);
                  vibrate(false);
                }}
              >
                {t('settings.testAlert')}
              </Button>
            </div>
            <NotificationsSetting siteId={site?.site_id} />
          </div>
        </Card>
        <Card title={t('settings.offlineSection')}>
          <EdgeUrlSetting siteId={site?.site_id} />
        </Card>
        <Card title={t('settings.branchSection')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{site?.name}</span>
            <Link to="/sites" className={buttonClass('secondary', 'md')}>
              {t('settings.changeSite')}
            </Link>
          </div>
        </Card>
        <Card title={t('settings.displaySection')}>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher className="min-h-tap" />
            <ThemeToggle className="min-h-tap" />
          </div>
        </Card>
        <Button variant="secondary" size="lg" block onClick={logout}>
          <LogOut aria-hidden="true" className="h-5 w-5 rtl:-scale-x-100" />
          {t('common:actions.signOut')}
        </Button>
        <p className="text-center text-xs text-muted">{t('settings.privacy')}</p>
      </div>
    </Shell>
  );
}
