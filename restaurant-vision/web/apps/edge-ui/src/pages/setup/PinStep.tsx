// Step 1: the local setup PIN. First time: choose one (`POST /local/setup-pin`). Afterwards:
// enter it; it is checked against a protected endpoint and then kept in sessionStorage for this
// tab only and sent as `X-Setup-Pin`. Wrong PINs (401) and the lockout (429) are explained.
import { Button, TextField, useTranslation } from '@rv/shared';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { usePinSession, useLocalApi } from '../../api/context';
import { PIN_MAX_LEN, PIN_MIN_LEN, type SetupStatus } from '../../api/types';
import { errorKind, isStatus } from '../../lib/errors';
import type { StepProps } from './SetupLayout';
import { SETUP_STATUS_KEY, useSetup } from './setupState';

/** rv_edge PinGuard: 5 wrong PINs lock the client out for 30 s. */
export const LOCKOUT_S = 30;

function useCountdown(): [number, (seconds: number) => void] {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [until]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return [left, (s: number) => {
    setNow(Date.now());
    setUntil(Date.now() + s * 1000);
  }];
}

export function PinStep({ onDone }: StepProps) {
  const { t } = useTranslation();
  const api = useLocalApi();
  const session = usePinSession();
  const ctx = useSetup();
  const qc = useQueryClient();
  const creating = ctx.status?.pin_set === false;
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockLeft, startLock] = useCountdown();

  useEffect(() => {
    if (session.problem === 'locked') startLock(LOCKOUT_S);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the problem changes
  }, [session.problem]);

  if (ctx.pinOk) {
    return (
      <div className="flex max-w-xl flex-col gap-3 rounded-xl border border-success/40 bg-success-soft p-4">
        <p className="flex items-center gap-2 font-semibold text-success">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          {t('pin.unlocked')}
        </p>
        <p className="text-sm text-fg">{t('pin.unlockedBody')}</p>
        <div>
          <Button variant="secondary" onClick={() => session.lock()}>
            <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            {t('pin.lock')}
          </Button>
        </div>
      </div>
    );
  }

  const tooShort = pin.length < PIN_MIN_LEN;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (tooShort) {
      setError(t('pin.tooShort', { min: PIN_MIN_LEN }));
      return;
    }
    if (creating && pin !== confirm) {
      setError(t('pin.mismatch'));
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        try {
          await api.createPin(pin);
        } catch (err) {
          if (isStatus(err, 409)) {
            // Someone set it meanwhile: ask for it instead.
            await qc.invalidateQueries({ queryKey: SETUP_STATUS_KEY });
            setError(t('pin.alreadySet'));
            return;
          }
          throw err;
        }
      } else {
        await api.verifyPin(pin);
      }
      if (creating) {
        // The cached status still says "no PIN": update it now so the next step opens.
        qc.setQueryData<SetupStatus>(SETUP_STATUS_KEY, (old) => (old ? { ...old, pin_set: true } : old));
      }
      session.unlock(pin);
      setPin('');
      setConfirm('');
      void qc.invalidateQueries({ queryKey: SETUP_STATUS_KEY });
      onDone();
    } catch (err) {
      const kind = errorKind(err);
      if (kind === 'pin') setError(t('pin.wrong'));
      else if (kind === 'locked') {
        startLock(LOCKOUT_S);
        setError(null);
      } else if (kind === 'network') setError(t('errors.network'));
      else setError(t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate>
      {session.problem === 'invalid' && (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {t('pin.rejected')}
        </p>
      )}
      {lockLeft > 0 && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t('pin.locked', { seconds: lockLeft })}
        </p>
      )}
      <p className="flex items-start gap-2 text-sm">
        <KeyRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        {creating ? t('pin.createHint', { min: PIN_MIN_LEN }) : t('pin.enterHint')}
      </p>
      <TextField
        label={creating ? t('pin.newPin') : t('pin.pin')}
        type="password"
        name="setup-pin"
        autoComplete={creating ? 'new-password' : 'current-password'}
        inputMode="numeric"
        minLength={PIN_MIN_LEN}
        maxLength={PIN_MAX_LEN}
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        error={error ?? undefined}
        className="text-lg tracking-widest"
      />
      {creating && (
        <TextField
          label={t('pin.confirmPin')}
          type="password"
          name="setup-pin-confirm"
          autoComplete="new-password"
          inputMode="numeric"
          maxLength={PIN_MAX_LEN}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="text-lg tracking-widest"
        />
      )}
      <div>
        <Button type="submit" size="lg" loading={busy} disabled={lockLeft > 0}>
          {creating ? t('pin.create') : t('pin.unlock')}
        </Button>
      </div>
      <p className="text-xs text-muted">{t('pin.storageNote')}</p>
    </form>
  );
}
