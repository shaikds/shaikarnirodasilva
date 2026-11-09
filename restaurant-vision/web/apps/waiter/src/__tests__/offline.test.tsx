import { TestProviders } from '@rv/shared/test-utils';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from '../components/OfflineBanner';
import { OFFLINE_AFTER_MS, isOffline } from '../lib/offline';
import {
  DEFAULT_EDGE_URL,
  WAITER_SETTINGS_KEY,
  isValidEdgeUrl,
  useWaiterSettings,
} from '../lib/settings';
import { setupWaiterI18n } from '../test/utils';

const now = 1_800_000_000_000;

describe('isOffline', () => {
  it('stays online while everything answers', () => {
    expect(
      isOffline({ apiDownSince: null, wsDownSince: null, browserOfflineSince: null, nowMs: now }),
    ).toBe(false);
  });

  it('waits 10 s before declaring the cloud unreachable', () => {
    expect(
      isOffline({
        apiDownSince: now - OFFLINE_AFTER_MS,
        wsDownSince: null,
        browserOfflineSince: null,
        nowMs: now,
      }),
    ).toBe(false);
    expect(
      isOffline({
        apiDownSince: now - OFFLINE_AFTER_MS - 1,
        wsDownSince: null,
        browserOfflineSince: null,
        nowMs: now,
      }),
    ).toBe(true);
  });

  it('counts the socket or the browser network being down', () => {
    expect(
      isOffline({
        apiDownSince: null,
        wsDownSince: now - 11_000,
        browserOfflineSince: null,
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      isOffline({
        apiDownSince: null,
        wsDownSince: null,
        browserOfflineSince: now - 12_000,
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      isOffline({
        apiDownSince: null,
        wsDownSince: now - 3_000,
        browserOfflineSince: null,
        nowMs: now,
      }),
    ).toBe(false);
  });
});

describe('offline banner and edge URL setting', () => {
  beforeEach(async () => {
    await setupWaiterI18n('en');
    useWaiterSettings.setState({ edgeUrl: null, autoEdgeUrls: {} });
  });

  it('links to the local edge alerts page', () => {
    render(<OfflineBanner edgeUrl={DEFAULT_EDGE_URL} />, { wrapper: TestProviders });
    expect(screen.getByRole('alert')).toHaveTextContent('No connection to the cloud');
    expect(screen.getByRole('link', { name: 'Open local alerts' })).toHaveAttribute(
      'href',
      'http://rv-edge.local:8787/local-alerts',
    );
  });

  it('has no manual address by default and validates addresses', () => {
    expect(useWaiterSettings.getState().edgeUrl).toBeNull();
    expect(DEFAULT_EDGE_URL).toBe('http://rv-edge.local:8787/local-alerts');
    expect(isValidEdgeUrl('http://192.168.1.20:8787/local-alerts')).toBe(true);
    expect(isValidEdgeUrl('ftp://x')).toBe(false);
    expect(isValidEdgeUrl('not a url')).toBe(false);
  });

  it('persists the address to localStorage', () => {
    useWaiterSettings.getState().setEdgeUrl('http://192.168.1.20:8787/local-alerts');
    expect(window.localStorage.getItem(WAITER_SETTINGS_KEY)).toContain('192.168.1.20');
    useWaiterSettings.getState().setEdgeUrl('javascript:alert(1)');
    expect(useWaiterSettings.getState().edgeUrl).toBeNull(); // back to automatic
  });

  it('keeps working when localStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(() =>
        useWaiterSettings.getState().setEdgeUrl('http://10.0.0.5:8787/local-alerts'),
      ).not.toThrow();
      expect(useWaiterSettings.getState().edgeUrl).toBe('http://10.0.0.5:8787/local-alerts');
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});
