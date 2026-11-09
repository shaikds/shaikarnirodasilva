// The offline link defaults to `<local_url>/local-alerts` of the site's edge, from
// `GET /sites/{id}/devices` (reduced view for waiters); a manual address overrides it.
import type { DeviceStatus } from '@rv/shared';
import { createMockServer } from '@rv/shared/mock/node';
import { renderWithProviders, signInAs, signOut } from '@rv/shared/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localAlertsUrl, pickEdgeDevice, useEdgeUrl } from '../lib/edgeUrl';
import { DEFAULT_EDGE_URL, useWaiterSettings } from '../lib/settings';
import { setupWaiterI18n } from '../test/utils';

const device = (over: Partial<DeviceStatus>): DeviceStatus => ({
  device_id: 'd',
  version: null,
  last_seen_at: 100,
  online: true,
  cameras: [],
  cpu_pct: null,
  mem_mb: null,
  outbox_depth: null,
  local_url: null,
  ...over,
});

describe('edge offline link', () => {
  it('builds <local_url>/local-alerts', () => {
    expect(localAlertsUrl('http://192.168.1.20:8787')).toBe(
      'http://192.168.1.20:8787/local-alerts',
    );
    expect(localAlertsUrl('http://192.168.1.20:8787/')).toBe(
      'http://192.168.1.20:8787/local-alerts',
    );
    expect(localAlertsUrl(null)).toBeNull();
    expect(localAlertsUrl('file:///etc')).toBeNull();
  });

  it('prefers an online device, then the most recently seen', () => {
    const old = device({
      device_id: 'old',
      online: false,
      last_seen_at: 900,
      local_url: 'http://10.0.0.1:8787',
    });
    const live = device({
      device_id: 'live',
      online: true,
      last_seen_at: 500,
      local_url: 'http://10.0.0.2:8787',
    });
    const blank = device({ device_id: 'blank', online: true, last_seen_at: 999 });
    expect(pickEdgeDevice([old, live, blank])?.device_id).toBe('live');
    expect(pickEdgeDevice([old, blank])?.device_id).toBe('old');
    expect(pickEdgeDevice([blank])).toBeNull();
  });
});

const { db, server } = createMockServer({ seedLive: false });

function Probe({ siteId }: { siteId: string }) {
  const edge = useEdgeUrl(siteId);
  return (
    <p data-testid="edge">
      {edge.source} {edge.url}
    </p>
  );
}

describe('useEdgeUrl with the mock backend', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    signOut();
  });
  afterAll(() => server.close());
  beforeEach(async () => {
    await setupWaiterI18n('en');
    useWaiterSettings.setState({ edgeUrl: null, autoEdgeUrls: {} });
    signInAs(db, 'waiter@example.com');
  });

  it("uses the site edge's local_url, which waiters may read", async () => {
    const localUrl = db.devices('site-tlv')[0]!.local_url!;
    renderWithProviders(<Probe siteId="site-tlv" />);
    expect(screen.getByTestId('edge')).toHaveTextContent(`default ${DEFAULT_EDGE_URL}`);
    await waitFor(() =>
      expect(screen.getByTestId('edge')).toHaveTextContent(`edge ${localUrl}/local-alerts`),
    );
    // Remembered for when the cloud is unreachable after a reload.
    expect(useWaiterSettings.getState().autoEdgeUrls['site-tlv']).toBe(`${localUrl}/local-alerts`);
  });

  it('keeps a manual override', async () => {
    useWaiterSettings.getState().setEdgeUrl('http://10.1.2.3:8787/local-alerts');
    renderWithProviders(<Probe siteId="site-tlv" />);
    await waitFor(() =>
      expect(useWaiterSettings.getState().autoEdgeUrls['site-tlv']).toBeDefined(),
    );
    expect(screen.getByTestId('edge')).toHaveTextContent(
      'manual http://10.1.2.3:8787/local-alerts',
    );
  });
});
