// Add / edit one camera. The stream address is built from a brand template (host, port,
// channel, substream) or typed as a raw RTSP URL. Credentials are write-only: the fields start
// empty, are sent once in their own fields (never inside the URL), and are cleared afterwards.
import { Button, SelectField, Switch, TextField, cn, useTranslation } from '@rv/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { textLength, LABEL_MAX } from '../../lib/validation';
import {
  BRANDS,
  buildRtspUrl,
  DEFAULT_RTSP_PORT,
  isAcceptedCameraUrl,
  parseCameraUrl,
  previewUrl,
  redactUrl,
  rtspPartsError,
  type BrandKey,
} from '../../lib/rtsp';

export type AddressMode = 'brand' | 'url';

export interface CameraFormValues {
  name: string;
  mode: AddressMode;
  brand: BrandKey;
  host: string;
  port: string;
  channel: string;
  substream: boolean;
  url: string;
}

export interface CameraFormResult {
  name: string;
  /** The new stream URL, or null to keep the stored one (edit without address changes). */
  url: string | null;
  username: string | null;
  password: string | null;
}

export interface CameraFormProps {
  /** Edit: the current values. `redactedUrl` is what the edge lists (credentials hidden). */
  initial?: { name: string; redactedUrl: string | null; hasCredentials: boolean; streamless: boolean };
  /** Prefill for a discovered camera. */
  preset?: Partial<CameraFormValues>;
  /** Simulated cameras: only the name can change. */
  nameOnly?: boolean;
  busy?: boolean;
  onSubmit: (result: CameraFormResult) => Promise<boolean>;
  onCancel: () => void;
}

function initialValues(props: CameraFormProps): CameraFormValues {
  const base: CameraFormValues = {
    name: props.initial?.name ?? '',
    mode: 'brand',
    brand: 'hikvision',
    host: '',
    port: String(DEFAULT_RTSP_PORT),
    channel: '1',
    substream: true,
    url: '',
  };
  const parsed = props.initial?.redactedUrl ? parseCameraUrl(props.initial.redactedUrl) : null;
  if (props.initial?.redactedUrl) {
    if (parsed?.brand) {
      Object.assign(base, {
        mode: 'brand',
        brand: parsed.brand,
        host: parsed.host,
        port: String(parsed.port),
        channel: String(parsed.channel ?? 1),
        substream: parsed.substream ?? true,
      });
    } else {
      // Unknown path: keep the raw mode, but never prefill the (redacted) URL itself.
      base.mode = 'url';
    }
  }
  return { ...base, ...props.preset };
}

const sameAddress = (a: CameraFormValues, b: CameraFormValues) =>
  a.mode === b.mode &&
  (a.mode === 'url'
    ? a.url.trim() === b.url.trim()
    : a.brand === b.brand &&
      a.host.trim() === b.host.trim() &&
      a.port === b.port &&
      a.channel === b.channel &&
      a.substream === b.substream);

export function CameraForm(props: CameraFormProps) {
  const { initial, nameOnly, busy, onSubmit, onCancel } = props;
  const { t } = useTranslation();
  const start = useMemo(() => initialValues(props), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<CameraFormValues>(start);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = !!initial;
  const set = <K extends keyof CameraFormValues>(key: K, value: CameraFormValues[K]) =>
    setV((old) => ({ ...old, [key]: value }));

  const addressChanged = !editing || initial.streamless || !sameAddress(v, start);
  const needsAddress = !nameOnly && addressChanged;

  const built = useMemo(() => {
    if (v.mode === 'url') return isAcceptedCameraUrl(v.url) ? v.url.trim() : null;
    const parts = {
      brand: v.brand,
      host: v.host,
      port: Number(v.port),
      channel: Number(v.channel),
      substream: v.substream,
    };
    return rtspPartsError(parts) ? null : buildRtspUrl(parts);
  }, [v]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const nameLen = textLength(v.name.trim());
    if (nameLen === 0) e.name = t('cameras.form.nameRequired');
    else if (nameLen > LABEL_MAX) e.name = t('validation.labelTooLong', { max: LABEL_MAX });
    if (needsAddress) {
      if (v.mode === 'url') {
        if (!isAcceptedCameraUrl(v.url)) e.url = t('cameras.form.urlInvalid');
      } else {
        const err = rtspPartsError({
          brand: v.brand,
          host: v.host,
          port: Number(v.port),
          channel: Number(v.channel),
          substream: v.substream,
        });
        if (err === 'hostRequired') e.host = t('cameras.form.hostRequired');
        if (err === 'portInvalid') e.port = t('cameras.form.portInvalid');
        if (err === 'channelInvalid') e.channel = t('cameras.form.channelInvalid');
      }
    }
    if (password && !username) e.username = t('cameras.form.userForPassword');
    return e;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await onSubmit({
      name: v.name.trim(),
      url: nameOnly || !addressChanged ? null : built,
      username: username.trim() || null,
      password: password || null,
    });
    // Write-only: forget the secret as soon as it was sent (success or not, it must be retyped).
    setPassword('');
    if (ok) setUsername('');
  };

  const brandNoteKey = `cameras.brandNote.${v.brand}`;
  const preview = built ? previewUrl(redactUrl(built), !!username || (!!initial?.hasCredentials && !addressChanged)) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={editing ? t('cameras.form.editTitle') : t('cameras.form.addTitle')}>
      <TextField
        label={t('cameras.form.name')}
        hint={t('cameras.form.nameHint')}
        value={v.name}
        maxLength={LABEL_MAX}
        onChange={(e) => set('name', e.target.value)}
        error={errors.name}
        dir="auto"
      />

      {!nameOnly && (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">{t('cameras.form.address')}</legend>
            <div role="radiogroup" aria-label={t('cameras.form.address')} className="inline-flex w-fit rounded-lg border border-border bg-surface-2 p-1">
              {(['brand', 'url'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={v.mode === mode}
                  onClick={() => set('mode', mode)}
                  className={cn(
                    'min-h-[36px] rounded-md px-3 text-sm font-medium',
                    v.mode === mode ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-fg',
                  )}
                >
                  {t(`cameras.form.mode.${mode}`)}
                </button>
              ))}
            </div>

            {v.mode === 'brand' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label={t('cameras.form.brand')}
                  value={v.brand}
                  onChange={(e) => set('brand', e.target.value as BrandKey)}
                  hint={t(brandNoteKey)}
                >
                  {BRANDS.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.key === 'generic' ? t('cameras.form.genericBrand') : b.label}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label={t('cameras.form.host')}
                  placeholder="192.168.1.64"
                  dir="ltr"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={v.host}
                  onChange={(e) => set('host', e.target.value)}
                  error={errors.host}
                />
                <TextField
                  label={t('cameras.form.port')}
                  type="number"
                  dir="ltr"
                  inputMode="numeric"
                  min={1}
                  max={65535}
                  value={v.port}
                  onChange={(e) => set('port', e.target.value)}
                  error={errors.port}
                />
                <TextField
                  label={t('cameras.form.channel')}
                  hint={t('cameras.form.channelHint')}
                  type="number"
                  dir="ltr"
                  inputMode="numeric"
                  min={1}
                  value={v.channel}
                  onChange={(e) => set('channel', e.target.value)}
                  error={errors.channel}
                />
                <div className="sm:col-span-2">
                  <Switch
                    checked={v.substream}
                    onChange={(c) => set('substream', c)}
                    label={t('cameras.form.substream')}
                    description={t('cameras.form.substreamHint')}
                  />
                </div>
              </div>
            ) : (
              <TextField
                label={t('cameras.form.url')}
                placeholder="rtsp://192.168.1.64:554/Streaming/Channels/102"
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={v.url}
                onChange={(e) => set('url', e.target.value)}
                error={errors.url}
                hint={
                  editing && initial?.redactedUrl && !initial.streamless
                    ? t('cameras.form.urlKeep', { url: redactUrl(initial.redactedUrl) })
                    : t('cameras.form.urlHint')
                }
              />
            )}
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">{t('cameras.form.login')}</legend>
            <TextField
              label={t('cameras.form.username')}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={errors.username}
            />
            <div className="relative">
              <TextField
                label={t('cameras.form.password')}
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pe-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? t('cameras.form.hidePassword') : t('cameras.form.showPassword')}
                aria-pressed={showPassword}
                className="absolute bottom-0 end-0 flex h-[44px] w-11 items-center justify-center rounded-e-lg text-muted hover:text-fg"
              >
                {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted sm:col-span-2">
              {editing && initial?.hasCredentials
                ? addressChanged
                  ? t('cameras.form.loginRetype')
                  : t('cameras.form.loginKeep')
                : t('cameras.form.loginHint')}
            </p>
          </fieldset>

          {preview && (
            <p className="text-xs text-muted">
              {t('cameras.form.preview')}{' '}
              <code className="break-all rounded bg-surface-2 px-1.5 py-0.5 text-fg" dir="ltr">
                {preview}
              </code>
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {editing ? t('common:actions.save') : t('cameras.form.addSubmit')}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t('common:actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
