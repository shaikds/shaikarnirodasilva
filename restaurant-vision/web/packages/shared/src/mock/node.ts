// MSW server for tests (Node / jsdom).
import { setupServer } from 'msw/node';
import { MockDb, type MockDbOptions } from './db';
import { createHandlers } from './handlers';

export function createMockServer(options: MockDbOptions = {}) {
  const db = new MockDb(options);
  const server = setupServer(...createHandlers(db));
  return { db, server };
}

export { MockDb };
