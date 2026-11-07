import {
  Button,
  LanguageSwitcher,
  TextField,
  isApiError,
  rvEnv,
  useLogin,
  useTranslation,
} from '@rv/shared';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@rv/shared/mock/demo';
import { BellRing } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState(false);

  const submit = (creds: { email: string; password: string }) =>
    login.mutate(creds, { onSuccess: () => navigate('/', { replace: true }) });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setMissing(true);
      return;
    }
    setMissing(false);
    submit({ email: email.trim(), password });
  };
  const error = missing
    ? t('login.required')
    : login.error
      ? isApiError(login.error) && login.error.status === 401
        ? t('login.invalid')
        : isApiError(login.error) && login.error.isNetwork
          ? t('common:errors.network')
          : t('common:errors.generic')
      : null;
  const demo = DEMO_ACCOUNTS.find((a) => a.role === 'waiter')!;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4">
      <div className="flex justify-end py-3">
        <LanguageSwitcher className="min-h-tap" />
      </div>
      <main id="main" className="flex flex-1 flex-col justify-center pb-16">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="rounded-2xl bg-primary p-3 text-primary-fg">
            <BellRing aria-hidden="true" className="h-8 w-8" />
          </span>
          <h1 className="text-2xl font-semibold">{t('login.title')}</h1>
          <p className="text-muted">{t('login.subtitle')}</p>
        </div>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            label={t('login.email')}
            type="email"
            inputMode="email"
            autoComplete="username"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[52px] text-base"
          />
          <TextField
            label={t('login.password')}
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[52px] text-base"
          />
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="xl" block loading={login.isPending}>
            {t('login.submit')}
          </Button>
        </form>
        {rvEnv.mock && (
          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="mb-2 text-sm text-muted">{t('login.demoTitle')}</p>
            <Button
              variant="secondary"
              size="lg"
              block
              onClick={() => submit({ email: demo.email, password: DEMO_PASSWORD })}
            >
              {t('login.demoWaiter')}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
