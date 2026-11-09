import { Card, PageHeader, useTranslation } from '@rv/shared';
import { Download, ShieldCheck } from 'lucide-react';
import { COMPLIANCE_DOCS, COMPLIANCE_LANGS, compliancePdf } from '../lib/compliance';

const PRINCIPLES = ['noFaces', 'noVideo', 'noStaff', 'rotation'] as const;

export function CompliancePage() {
  const { t } = useTranslation();
  const base = import.meta.env.BASE_URL;
  return (
    <>
      <PageHeader title={t('compliance.title')} subtitle={t('compliance.intro')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        <Card title={t('compliance.templatesTitle')} description={t('compliance.templatesHint')}>
          <ul className="divide-y divide-border">
            {COMPLIANCE_DOCS.map((doc) => (
              <li key={doc} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 text-sm">{t(`compliance.docs.${doc}`)}</span>
                <span className="flex gap-1">
                  {COMPLIANCE_LANGS.map((lang) => (
                    <a
                      key={lang}
                      href={`${base}${compliancePdf(doc, lang)}`}
                      hrefLang={lang}
                      download
                      className="inline-flex min-h-tap items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-surface-2"
                      aria-label={`${t('compliance.download')}: ${t(`compliance.docs.${doc}`)} (${t(`compliance.lang.${lang}`)})`}
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      {t(`compliance.lang.${lang}`)}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
