import { Button, TextField, isApiError, rvEnv, useLogin, useTranslation } from '@rv/shared';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@rv/shared/mock/demo';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { isEmail } from '../lib/validation';

export function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const emailError = touched && !isEmail(email) ? t('auth.errors.email') : undefined;
  const passwordError = touched && !password ? t('auth.errors.required') : undefined;

  const submit = (creds: { email: string; password: string }) =>
    login.mutate(creds, { onSuccess: () => navigate(from, { replace: true }) });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isEmail(email) || !password) return;
    submit({ email: email.trim(), password });
  };

  const error = login.error
    ? isApiError(login.error) && login.error.status === 401
      ? t('auth.invalid')
      : isApiError(login.error) && login.error.isNetwork
        ? t('common:errors.network')
        : t('common:errors.generic')
    : null;

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="username"
          inputMode="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          required
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
          required
        />
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={login.isPending} block>
          {t('auth.submit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {t('auth.noAccount')}{' '}
        <Link to="/signup" className="font-medium text-primary underline-offset-2 hover:underline">
          {t('auth.createAccount')}
        </Link>
      </p>
      {rvEnv.mock && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm font-medium">{t('auth.demoTitle')}</p>
          <p className="mb-2 text-xs text-muted">{t('auth.demoHint', { password: DEMO_PASSWORD })}</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <Button
                key={a.email}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  submit({ email: a.email, password: DEMO_PASSWORD });
                }}
              >
                {t('auth.useDemo', { role: t(`roles.${a.role}`) })}
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
