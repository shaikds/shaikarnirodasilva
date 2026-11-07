import {
  LoadingBlock,
  PageHeader,
  useMe,
  useSiteConfig,
  useSiteSettings,
  useTranslation,
} from '@rv/shared';
import { useParams, useSearchParams } from 'react-router-dom';
import { FloorPlanEditor } from '../components/FloorPlanEditor';
import { DetailsForm, DevicesTab, ModulesForm, ThresholdsForm } from '../components/SettingsForms';
import { Tabs } from '../components/Tabs';
import { useAccess } from '../lib/access';

type TabId = 'details' | 'thresholds' | 'modules' | 'floorPlan' | 'devices';
const OWNER_TABS: TabId[] = ['details', 'thresholds', 'modules', 'floorPlan', 'devices'];
/** Managers: thresholds only (architecture 7.2), plus read-only device health. */
const MANAGER_TABS: TabId[] = ['thresholds', 'devices'];

export function SettingsPage() {
  const { siteId } = useParams();
  const { t } = useTranslation();
  const { access } = useAccess();
  const me = useMe();
  const settings = useSiteSettings(siteId);
  const config = useSiteConfig(siteId);
  const [params, setParams] = useSearchParams();
  const isOwner = access.role === 'owner';
  const allowed = isOwner ? OWNER_TABS : MANAGER_TABS;
  const requested = params.get('tab') as TabId | null;
  const tab: TabId = requested && allowed.includes(requested) ? requested : allowed[0]!;

  if (!siteId || settings.isLoading || !settings.data) return <LoadingBlock />;
  const site = settings.data;

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={site.name} />
      {!isOwner && <p className="mb-4 text-sm text-muted">{t('settings.ownerOnly')}</p>}
      <Tabs
        label={t('settings.tabs.label')}
        tabs={allowed.map((id) => ({ id, label: t(`settings.tabs.${id}`) }))}
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
      >
        {/* `key` remounts forms when the saved settings change underneath them. */}
        {tab === 'details' && <DetailsForm key={site.site_id} site={site} />}
        {tab === 'thresholds' && <ThresholdsForm key={site.site_id} site={site} />}
        {tab === 'modules' && (
          <ModulesForm key={site.site_id} site={site} plan={me.data?.org.plan ?? 'pro'} />
        )}
        {tab === 'floorPlan' &&
          (config.data ? (
            <FloorPlanEditor key={site.site_id} site={site} tables={config.data.tables} />
          ) : (
            <LoadingBlock />
          ))}
        {tab === 'devices' && <DevicesTab siteId={site.site_id} canPair={isOwner} />}
      </Tabs>
    </>
  );
}
