// Users and roles (owners only). Names and emails exist only for account management: no
// metric anywhere is attributed to a person.
import {
  Badge,
  Button,
  Card,
  LoadingBlock,
  PageHeader,
  SelectField,
  TextField,
  inputClass,
  isApiError,
  useCreateUser,
  useDeleteUser,
  useMe,
  useTranslation,
  useUpdateUser,
  useUsers,
  type Locale,
  type MembershipInfo,
  type OrgUser,
  type Role,
  type SiteRef,
} from '@rv/shared';
import { Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isEmail } from '../lib/validation';

const ROLES: Role[] = ['owner', 'manager', 'waiter'];

function membershipFor(role: Role, siteId: string | null): MembershipInfo {
  return role === 'owner' ? { role, site_id: null } : { role, site_id: siteId };
}

function RoleEditor({
  user,
  sites,
  orgId,
  isSelf,
}: {
  user: OrgUser;
  sites: SiteRef[];
  orgId: string;
  isSelf: boolean;
}) {
  const { t } = useTranslation();
  const update = useUpdateUser(orgId);
  const remove = useDeleteUser(orgId);
  const first = user.memberships[0] ?? { role: 'waiter' as Role, site_id: sites[0]?.site_id ?? null };
  const [role, setRole] = useState<Role>(first.role);
  const [siteId, setSiteId] = useState<string | null>(first.site_id ?? sites[0]?.site_id ?? null);
  const dirty = role !== first.role || (role !== 'owner' && siteId !== first.site_id);

  return (
    <tr className="border-b border-border align-middle last:border-0">
      <th scope="row" className="px-3 py-2 text-start text-sm font-medium">
        {user.name} {isSelf && <Badge className="ms-1">{t('users.you')}</Badge>}
      </th>
      <td className="px-3 py-2 text-sm" dir="ltr">
        {user.email}
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={`${t('users.columns.role')}: ${user.name}`}
          className={inputClass}
          value={role}
          disabled={isSelf}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        {role === 'owner' ? (
          <span className="text-sm text-muted">{t('users.allSites')}</span>
        ) : (
          <select
            aria-label={`${t('users.columns.site')}: ${user.name}`}
            className={inputClass}
            value={siteId ?? ''}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.site_id} value={s.site_id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              size="sm"
              loading={update.isPending}
              onClick={() =>
                update.mutate({ userId: user.user_id, body: { memberships: [membershipFor(role, siteId)] } })
              }
            >
              {t('users.save')}
            </Button>
          )}
          {!isSelf && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('users.remove', { name: user.name })}
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm(t('users.confirmRemove', { name: user.name }))) remove.mutate(user.user_id);
              }}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
        {(update.isError || remove.isError) && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {t('common:errors.generic')}
          </p>
        )}
      </td>
    </tr>
  );
}

function AddUserForm({ orgId, sites, onDone }: { orgId: string; sites: SiteRef[]; onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateUser(orgId);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'waiter' as Role,
    siteId: sites[0]?.site_id ?? '',
    locale: 'he' as Locale,
  });
  const [touched, setTouched] = useState(false);
  const errors = {
    name: !form.name.trim() ? t('auth.errors.required') : undefined,
    email: !isEmail(form.email) ? t('auth.errors.email') : undefined,
    password: form.password.length < 8 ? t('auth.errors.passwordMin') : undefined,
  };
  const valid = !errors.name && !errors.email && !errors.password && (form.role === 'owner' || !!form.siteId);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    create.mutate(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        locale: form.locale,
        memberships: [membershipFor(form.role, form.siteId || null)],
      },
      { onSuccess: onDone },
    );
  };
  return (
    <Card title={t('users.addTitle')} className="mb-4">
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label={t('users.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={touched ? errors.name : undefined} maxLength={64} />
        <TextField label={t('users.email')} type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={touched ? errors.email : undefined} />
        <TextField
          label={t('users.password')}
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={touched ? errors.password : undefined}
          hint={t('auth.passwordHint')}
        />
        <SelectField label={t('users.role')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </SelectField>
        {form.role !== 'owner' && (
          <SelectField label={t('users.site')} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
            {sites.map((s) => (
              <option key={s.site_id} value={s.site_id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField label={t('users.language')} value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as Locale })}>
          <option value="he">{t('common:lang.he')}</option>
          <option value="en">{t('common:lang.en')}</option>
        </SelectField>
        {create.isError && (
          <p role="alert" className="text-sm text-danger sm:col-span-2 lg:col-span-3">
            {isApiError(create.error) && create.error.status === 409 ? t('users.emailTaken') : t('common:errors.generic')}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" loading={create.isPending}>
            {t('users.create')}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t('common:actions.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function UsersPage() {
  const { t } = useTranslation();
  const me = useMe();
  const orgId = me.data?.org.org_id;
  const users = useUsers(orgId);
  const [adding, setAdding] = useState(false);
  const sites = me.data?.sites ?? [];
  const th = 'whitespace-nowrap px-3 py-2 text-start text-xs font-semibold text-muted';

  return (
    <>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.intro')}
        actions={
          !adding && (
            <Button onClick={() => setAdding(true)}>
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              {t('users.add')}
            </Button>
          )
        }
      />
      {adding && orgId && <AddUserForm orgId={orgId} sites={sites} onDone={() => setAdding(false)} />}
      <Card padded={false}>
        {users.isLoading || !orgId ? (
          <LoadingBlock />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <caption className="sr-only">{t('users.title')}</caption>
              <thead>
                <tr className="border-b border-border">
                  {(['name', 'email', 'role', 'site', 'actions'] as const).map((c) => (
                    <th key={c} scope="col" className={th}>
                      {t(`users.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((u) => (
                  <RoleEditor
                    key={`${u.user_id}:${JSON.stringify(u.memberships)}`}
                    user={u}
                    sites={sites}
                    orgId={orgId}
                    isSelf={u.user_id === me.data?.user.user_id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
