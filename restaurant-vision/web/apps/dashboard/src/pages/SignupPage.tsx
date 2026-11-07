import {
  Button,
  SelectField,
  TextField,
  currentLanguage,
  isApiError,
  useSignup,
  useTranslation,
  type Locale,
} from '@rv/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { isEmail } from '../lib/validation';

export function SignupPage() {
  const { t } = useTranslation();
  const signup = useSignup();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    org_name: '',
    name: '',
    email: '',
    password: '',
    locale: currentLanguage() as Locale,
  });
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const errors = {
    org_name: !form.org_name.trim() ? t('auth.errors.required') : undefined,
    name: !form.name.trim() ? t('auth.errors.required') : undefined,
    email: !isEmail(form.email) ? t('auth.errors.email') : undefined,
    password: form.password.length < 8 ? t('auth.errors.passwordMin') : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    signup.mutate(
      { ...form, org_name: form.org_name.trim(), name: form.name.trim(), email: form.email.trim() },
      { onSuccess: () => navigate('/', { replace: true }) },
    );
  };

  const error = signup.error
    ? isApiError(signup.error) && signup.error.status === 409
      ? t('auth.emailTaken')
      : t('common:errors.generic')
    : null;

  return (
    <AuthLayout title={t('auth.signupTitle')} subtitle={t('auth.signupSubtitle')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('auth.orgName')}
          value={form.org_name}
          onChange={set('org_name')}
          error={show('org_name')}
          required
          maxLength={64}
          autoComplete="organization"
        />
        <TextField
          label={t('auth.name')}
          value={form.name}
          onChange={set('name')}
          error={show('name')}
          required
          maxLength={64}
          autoComplete="name"
        />
        <TextField
          label={t('auth.email')}
          type="email"
          dir="ltr"
          value={form.email}
          onChange={set('email')}
          error={show('email')}
          required
          autoComplete="email"
        />
        <TextField
          label={t('auth.password')}
          type="password"
          dir="ltr"
          value={form.password}
          onChange={set('password')}
          error={show('password')}
          hint={t('auth.passwordHint')}
          required
          autoComplete="new-password"
        />
        <SelectField label={t('auth.language')} value={form.locale} onChange={set('locale')}>
          <option value="he">{t('common:lang.he')}</option>
          <option value="en">{t('common:lang.en')}</option>
        </SelectField>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={signup.isPending} block>
          {t('auth.signupSubmit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary underline-offset-2 hover:underline">
          {t('auth.submit')}
        </Link>
      </p>
    </AuthLayout>
  );
}
