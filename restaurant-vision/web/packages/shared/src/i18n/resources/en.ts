// English strings of the shared `common` namespace. Keep keys identical to he.ts (tested).
import type { Messages } from './types';

export const commonEn = {
  app: {
    name: 'Restaurant Vision',
    tagline: 'Anonymous live insights from your existing cameras',
  },
  actions: {
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Try again',
    signIn: 'Sign in',
    signOut: 'Sign out',
    back: 'Back',
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    confirm: 'Confirm',
    copy: 'Copy',
    copied: 'Copied',
    refresh: 'Refresh',
  },
  lang: {
    label: 'Language',
    he: 'עברית',
    en: 'English',
  },
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    toggle: 'Switch theme (now: {{mode}})',
  },
  nav: {
    skipToContent: 'Skip to main content',
    mainNav: 'Main navigation',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    account: 'Account',
  },
  tableState: {
    empty: 'Empty',
    seated: 'Seated',
    attended: 'Attended',
    needs_bussing: 'Needs bussing',
  },
  tableStateHint: {
    empty: 'Ready for guests',
    seated: 'Guests seated, waiting for a first visit',
    attended: 'Guests have been visited',
    needs_bussing: 'Guests left, table needs clearing',
  },
  alertKind: {
    waiter_needed: 'Waiter needed',
    checkin_needed: 'Check-in needed',
    bussing_needed: 'Bussing needed',
    long_queue: 'Long queue at the entrance',
  },
  /** How long the guests have been waiting, measured from when the condition began. */
  alertWaiting: {
    waiter_needed: 'Guests waiting',
    checkin_needed: 'Guests waiting',
    bussing_needed: 'Waiting to be cleared',
    long_queue: 'Guests waiting',
  },
  /** "since 19:42": when the guests sat down / the condition began. */
  alertSince: 'since {{time}}',
  severity: {
    info: 'Info',
    warn: 'Warning',
    urgent: 'Urgent',
  },
  alertStatus: {
    open: 'Open',
    acknowledged: 'Someone is on it',
    resolved: 'Resolved',
  },
  ackVia: {
    cloud: 'via app',
    local: 'via restaurant Wi-Fi',
  },
  connection: {
    idle: 'Not connected',
    connecting: 'Connecting…',
    open: 'Live',
    reconnecting: 'Reconnecting…',
    closed: 'Disconnected',
    label: 'Live connection: {{status}}',
  },
  camera: {
    ok: 'OK',
    degraded: 'Degraded',
    offline: 'Offline',
  },
  device: {
    online: 'Online',
    offline: 'Offline',
  },
  estimate: {
    badge: 'Estimate',
    title: 'This figure is an estimate',
    howCalculated: 'How is this calculated?',
  },
  units: {
    s: '{{n}} s',
    min: '{{n}} min',
    h: '{{n}} h',
    hmin: '{{h}} h {{m}} min',
  },
  time: {
    now: 'now',
  },
  status: {
    loading: 'Loading…',
    notEnoughData: 'Not enough data',
    none: '—',
  },
  table: {
    name: 'Table {{label}}',
    guests_one: '{{count}} guest',
    guests_other: '{{count}} guests',
    seats_one: '{{count}} seat',
    seats_other: '{{count}} seats',
    since: 'for {{duration}}',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
    network: 'Cannot reach the server. Check the connection.',
    unauthorized: 'Your session has ended. Please sign in again.',
    forbidden: 'You do not have access to this page.',
    notFound: 'Not found.',
    boundaryTitle: 'This part of the page failed to load',
    boundaryBody: 'The rest of the app still works. Try again, or reload the page.',
    reload: 'Reload page',
  },
  empty: {
    title: 'Nothing here yet',
  },
  privacy: {
    short: 'Anonymous by design: no faces, no video leaves the restaurant, no per-employee data.',
  },
} satisfies Messages;
