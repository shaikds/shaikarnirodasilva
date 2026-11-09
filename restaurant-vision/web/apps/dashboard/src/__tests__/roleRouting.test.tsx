import { signInAs, signOut } from '@rv/shared/test-utils';
import { createMockServer } from '@rv/shared/mock/node';
import { screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canOpen, landingFor } from '../lib/access';
import { renderApp, setupDashboardI18n } from '../test/utils';

const { db, server } = createMockServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  signOut();
});
afterAll(() => server.close());
beforeEach(() => setupDashboardI18n('en'));

const location = () => screen.getByTestId('location').textContent;

describe('landingFor / canOpen', () => {
  it('maps roles to landing pages', () => {
    expect(landingFor({ role: 'owner', siteId: null, siteIds: [] })).toEqual({
      kind: 'path',
      path: '/',
    });
    expect(landingFor({ role: 'manager', siteId: 's1', siteIds: ['s1'] })).toEqual({
      kind: 'path',
      path: '/sites/s1/live',
    });
    expect(landingFor({ role: 'waiter', siteId: 's1', siteIds: ['s1'] })).toEqual({
      kind: 'waiter',
    });
    expect(landingFor({ role: null, siteId: null, siteIds: [] })).toEqual({ kind: 'no-access' });
  });

  it('limits managers to their site and non-owner pages', () => {
    const manager = { role: 'manager' as const, siteId: 's1', siteIds: ['s1'] };
    expect(canOpen(manager, 'live', 's1')).toBe(true);
    expect(canOpen(manager, 'live', 's2')).toBe(false);
    expect(canOpen(manager, 'users')).toBe(false);
    expect(canOpen(manager, 'overview')).toBe(false);
    const owner = { role: 'owner' as const, siteId: null, siteIds: ['s1', 's2'] };
    expect(canOpen(owner, 'users')).toBe(true);
    expect(canOpen(owner, 'settings', 's2')).toBe(true);
  });
});

describe('role-aware routing', () => {
  it('sends signed-out users to the login page', async () => {
    renderApp('/sites/site-tlv/live');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(location()).toBe('/login');
  });

  it('shows the owner the org overview with every branch', async () => {
    signInAs(db, 'demo@example.com');
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'זית – תל אביב' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'זית – חיפה' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users & roles' })).toBeInTheDocument();
  });

  it('lets the owner open any branch and the users page', async () => {
    signInAs(db, 'demo@example.com');
    renderApp('/users');
    expect(await screen.findByRole('heading', { name: 'Users & roles' })).toBeInTheDocument();
    expect(location()).toBe('/users');
  });

  it('redirects a manager from the overview to their branch', async () => {
    signInAs(db, 'manager@example.com');
    renderApp('/');
    await waitFor(() => expect(location()).toBe('/sites/site-tlv/live'));
    expect(await screen.findByRole('heading', { name: 'Live floor' })).toBeInTheDocument();
  });

  it('keeps a manager out of other branches and the users page', async () => {
    signInAs(db, 'manager@example.com');
    renderApp('/sites/site-hfa/analytics');
    await waitFor(() => expect(location()).toBe('/sites/site-tlv/live'));
    expect(screen.queryByRole('link', { name: 'Users & roles' })).not.toBeInTheDocument();
  });

  it('keeps a manager out of user management', async () => {
    signInAs(db, 'manager@example.com');
    renderApp('/users');
    await waitFor(() => expect(location()).toBe('/sites/site-tlv/live'));
  });

  it('sends a waiter to the waiter app', async () => {
    signInAs(db, 'waiter@example.com');
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Alerts live in the waiter app' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the waiter app' })).toHaveAttribute(
      'href',
      'http://localhost:5174/',
    );
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
  });
});
