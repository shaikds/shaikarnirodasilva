// MSW server for tests (Node / jsdom): a fake edge on any origin.
import { setupServer } from 'msw/node';
import { EdgeMockDb, type EdgeMockOptions } from './db';
import { createEdgeHandlers } from './handlers';

export function createEdgeMockServer(options: EdgeMockOptions = {}) {
  const db = new EdgeMockDb(options);
  const server = setupServer(...createEdgeHandlers(db));
  return { db, server };
}

export { EdgeMockDb };
