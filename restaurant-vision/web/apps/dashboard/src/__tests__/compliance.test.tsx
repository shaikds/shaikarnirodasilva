// The Compliance page links only to PDFs the build really produces: compliance_pdfs.py renders
// every docs/compliance/<name>-<he|en>.md to /compliance/<name>-<he|en>.pdf.
import { screen, within } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { COMPLIANCE_DOCS, COMPLIANCE_LANGS, CompliancePage } from '../pages/CompliancePage';
import { renderRoute, setupDashboardI18n } from '../test/utils';

const COMPLIANCE_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/compliance',
);

describe('compliance page', () => {
  beforeEach(() => setupDashboardI18n('en'));

  it('every linked PDF has its source in docs/compliance', () => {
    for (const doc of COMPLIANCE_DOCS)
      for (const lang of COMPLIANCE_LANGS)
        expect(existsSync(resolve(COMPLIANCE_SRC, `${doc}-${lang}.md`)), `${doc}-${lang}.md`).toBe(
          true,
        );
  });

  it('links each template in Hebrew and English, as PDFs', () => {
    renderRoute(<CompliancePage />, '/compliance');
    const links = screen.getAllByRole('link');
    const hrefs = links.map((a) => a.getAttribute('href'));
    expect(hrefs).toHaveLength(COMPLIANCE_DOCS.length * 2);
    expect(hrefs).toContain('/compliance/signage-he.pdf');
    expect(hrefs).toContain('/compliance/staff-notice-en.pdf');
    for (const href of hrefs) expect(href).toMatch(/^\/compliance\/[a-z-]+-(he|en)\.pdf$/);
    const row = screen.getByText('DPIA template').closest('li')!;
    expect(
      within(row).getByRole('link', { name: 'Download: DPIA template (עברית)' }),
    ).toHaveAttribute('hreflang', 'he');
  });
});
