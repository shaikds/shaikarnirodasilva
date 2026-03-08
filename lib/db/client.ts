import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const PROD_DB_PATH = path.join(process.cwd(), 'data', 'localharvest.db');

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    rating REAL DEFAULT 5.0,
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    unit TEXT NOT NULL,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    description TEXT,
    is_available INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS group_buys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    target_qty INTEGER NOT NULL,
    current_qty INTEGER DEFAULT 0,
    regular_price REAL NOT NULL,
    group_price REAL NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'individual',
    group_buy_id INTEGER,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (group_buy_id) REFERENCES group_buys(id)
  );

  CREATE TABLE IF NOT EXISTS group_buy_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_buy_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    quantity REAL NOT NULL,
    order_id INTEGER,
    joined_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (group_buy_id) REFERENCES group_buys(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    prefer_group_buy INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    next_run TEXT NOT NULL,
    last_run TEXT,
    last_order_id INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`;

/** Factory — creates a fully initialised DB at any path (use ':memory:' for tests). */
export function createDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

let _db: Database.Database | null = null;

/** Singleton for production use. Tests should call resetDb() in beforeEach. */
export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH ?? PROD_DB_PATH;
    _db = createDatabase(dbPath);
  }
  return _db;
}

/** Reset singleton — used in tests only. Never call in production code. */
export function resetDb(): void {
  if (_db) {
    try { _db.close(); } catch { /* already closed */ }
  }
  _db = null;
}
