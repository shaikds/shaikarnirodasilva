// Hebrew is the default and right-to-left; English is left-to-right.
import { screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEdgeMockServer } from '../mock/node';
import { renderEdge, setupEdgeI18n } from '../test/utils';

const { server } = createEdgeMockServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('direction', () => {
  it('Hebrew sets <html dir="rtl" lang="he">', async () => {
    await setupEdgeI18n('he');
    renderEdge('/local-alerts');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.documentElement).toHaveAttribute('lang', 'he');
    expect(await screen.findByText('הכול רגוע')).toBeInTheDocument();
    expect(screen.getByText('מצב לא מקוון · רשת המסעדה')).toBeInTheDocument();
  });

  it('English sets dir="ltr"', async () => {
    await setupEdgeI18n('en');
    renderEdge('/');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(await screen.findByRole('heading', { name: 'Edge status' })).toBeInTheDocument();
  });
});
