// Demo credentials shown on login screens in mock mode. Kept separate from the mock backend so
// importing them never pulls MSW into a bundle.
export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ACCOUNTS = [
  { role: 'owner', email: 'owner@zayit.demo' },
  { role: 'manager', email: 'manager@zayit.demo' },
  { role: 'waiter', email: 'waiter@zayit.demo' },
] as const;
