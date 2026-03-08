/**
 * Test DB helper — creates a fresh in-memory SQLite for each test.
 * Modules read `getDb()` from lib/db/client; we override it via env.
 */
import { createDatabase, resetDb } from '../../lib/db/client';
import type Database from 'better-sqlite3';

export function createTestDb(): Database.Database {
  return createDatabase(':memory:');
}

/** Call in beforeEach to point the singleton to a fresh :memory: DB. */
export function setupTestDb(): void {
  process.env.DATABASE_PATH = ':memory:';
  resetDb();
}
