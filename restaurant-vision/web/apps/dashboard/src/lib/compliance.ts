/**
 * The compliance pack (`docs/compliance/<name>-<he|en>.md`), rendered to PDF by
 * `deploy/scripts/compliance_pdfs.py` at image build time and served by the cloud at
 * `/compliance/<name>-<he|en>.pdf`. Names here must match those files (a test checks it).
 */
export const COMPLIANCE_DOCS = [
  'signage',
  'privacy-notice',
  'staff-notice',
  'non-identification-statement',
  'dpia-template',
  'dpa-outline',
] as const;

export const COMPLIANCE_LANGS = ['he', 'en'] as const;

export type ComplianceDoc = (typeof COMPLIANCE_DOCS)[number];

/** `compliance/<name>-<lang>.pdf`, relative to the app base. */
export function compliancePdf(doc: ComplianceDoc, lang: (typeof COMPLIANCE_LANGS)[number]) {
  return `compliance/${doc}-${lang}.pdf`;
}
