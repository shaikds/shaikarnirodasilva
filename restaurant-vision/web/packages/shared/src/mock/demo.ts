// Demo credentials shown on login screens in mock mode. Kept separate from the mock backend so
// importing them never pulls MSW into a bundle. They match the cloud's demo seed
// (`python -m rv_cloud.tools.seed_demo`), so the same logins work against the real stack.
export const DEMO_PASSWORD = 'demo-password-123';

export const DEMO_ACCOUNTS = [
  { role: 'owner', email: 'demo@example.com' },
  { role: 'manager', email: 'manager@example.com' },
  { role: 'waiter', email: 'waiter@example.com' },
] as const;
