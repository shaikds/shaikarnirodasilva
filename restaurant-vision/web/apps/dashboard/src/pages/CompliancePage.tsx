import { Card, PageHeader, useTranslation } from '@rv/shared';
import { Download, ShieldCheck } from 'lucide-react';

/**
 * Templates are served from `/compliance/` (public/compliance, added by the docs engineer).
 * File names are fixed here; see the web report for the list.
 */
const COMPLIANCE_DOCS = [
  { key: 'signageHe', file: 'signage-he.pdf', lang: 'he' },
  { key: 'signageEn', file: 'signage-en.pdf', lang: 'en' },
  { key: 'staffHe', file: 'staff-notice-he.pdf', lang: 'he' },
  { key: 'staffEn', file: 'staff-notice-en.pdf', lang: 'en' },
  { key: 'nonIdentification', file: 'non-identification-statement.pdf', lang: undefined },
  { key: 'dpia', file: 'dpia-template.docx', lang: undefined },
  { key: 'dpa', file: 'dpa-outline.docx', lang: undefined },
] as const;

const PRINCIPLES = ['noFaces', 'noVideo', 'noStaff', 'rotation'] as const;

export function CompliancePage() {
  const { t } = useTranslation();
  const base = import.meta.env.BASE_URL;
  return (
    <>
      <PageHeader title={t('compliance.title')} subtitle={t('compliance.intro')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('compliance.principlesTitle')}>
          <ul className="flex flex-col gap-3">
            {PRINCIPLES.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {t(`compliance.principles.${p}`)}
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t('compliance.templatesTitle')}>
          <ul className="divide-y divide-border">
            {COMPLIANCE_DOCS.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">{t(`compliance.docs.${d.key}`)}</span>
                <a
                  href={`${base}compliance/${d.file}`}
                  hrefLang={d.lang}
                  download
                  className="inline-flex min-h-tap items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-surface-2"
                  aria-label={`${t('compliance.download')}: ${t(`compliance.docs.${d.key}`)}`}
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                  {t('compliance.download')}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
