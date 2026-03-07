import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'localharvest.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = db;

  database.exec(`
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
  `);
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export function getAllSuppliers() {
  return getDb().prepare(`
    SELECT s.*, COUNT(p.id) as product_count
    FROM suppliers s
    LEFT JOIN products p ON p.supplier_id = s.id AND p.is_available = 1
    GROUP BY s.id
    ORDER BY s.rating DESC
  `).all();
}

export function getSupplierById(id: number) {
  return getDb().prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}

export function createSupplier(data: {
  name: string; description?: string; location: string;
  phone?: string; email?: string; image_url?: string;
}) {
  const result = getDb().prepare(`
    INSERT INTO suppliers (name, description, location, phone, email, image_url)
    VALUES (@name, @description, @location, @phone, @email, @image_url)
  `).run(data);
  return result.lastInsertRowid;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export function getAllProducts(category?: string) {
  const query = category
    ? `SELECT p.*, s.name as supplier_name, s.location as supplier_location, s.rating as supplier_rating
       FROM products p JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_available = 1 AND p.category = ? ORDER BY p.created_at DESC`
    : `SELECT p.*, s.name as supplier_name, s.location as supplier_location, s.rating as supplier_rating
       FROM products p JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.is_available = 1 ORDER BY p.created_at DESC`;

  return category
    ? getDb().prepare(query).all(category)
    : getDb().prepare(query).all();
}

export function searchProducts(query: string) {
  return getDb().prepare(`
    SELECT p.*, s.name as supplier_name, s.location as supplier_location, s.rating as supplier_rating
    FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.is_available = 1 AND (
      LOWER(p.name) LIKE LOWER('%' || ? || '%') OR
      LOWER(p.category) LIKE LOWER('%' || ? || '%') OR
      LOWER(p.description) LIKE LOWER('%' || ? || '%')
    )
    ORDER BY p.name
  `).all(query, query, query);
}

export function getProductById(id: number) {
  return getDb().prepare(`
    SELECT p.*, s.name as supplier_name, s.location as supplier_location, s.rating as supplier_rating, s.phone as supplier_phone
    FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ?
  `).get(id);
}

export function getProductsBySupplier(supplierId: number) {
  return getDb().prepare(`
    SELECT * FROM products WHERE supplier_id = ? AND is_available = 1
  `).all(supplierId);
}

export function createProduct(data: {
  supplier_id: number; name: string; category: string;
  price: number; unit: string; stock_qty: number;
  image_url?: string; description?: string;
}) {
  const result = getDb().prepare(`
    INSERT INTO products (supplier_id, name, category, price, unit, stock_qty, image_url, description)
    VALUES (@supplier_id, @name, @category, @price, @unit, @stock_qty, @image_url, @description)
  `).run(data);
  return result.lastInsertRowid;
}

// ─── Group Buys ───────────────────────────────────────────────────────────────

export function getAllGroupBuys(status = 'active') {
  return getDb().prepare(`
    SELECT gb.*, p.name as product_name, p.image_url, p.unit, p.category,
           s.name as supplier_name, s.location as supplier_location,
           ROUND((gb.current_qty * 100.0 / gb.target_qty), 1) as progress_pct
    FROM group_buys gb
    JOIN products p ON p.id = gb.product_id
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE gb.status = ?
    ORDER BY gb.deadline ASC
  `).all(status);
}

export function getGroupBuyById(id: number) {
  return getDb().prepare(`
    SELECT gb.*, p.name as product_name, p.image_url, p.unit, p.category,
           p.description as product_description,
           s.name as supplier_name, s.location as supplier_location,
           ROUND((gb.current_qty * 100.0 / gb.target_qty), 1) as progress_pct
    FROM group_buys gb
    JOIN products p ON p.id = gb.product_id
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE gb.id = ?
  `).get(id);
}

export function createGroupBuy(data: {
  product_id: number; target_qty: number; regular_price: number;
  group_price: number; deadline: string;
}) {
  const result = getDb().prepare(`
    INSERT INTO group_buys (product_id, target_qty, regular_price, group_price, deadline)
    VALUES (@product_id, @target_qty, @regular_price, @group_price, @deadline)
  `).run(data);
  return result.lastInsertRowid;
}

export function joinGroupBuy(groupBuyId: number, customerName: string, customerEmail: string, quantity: number) {
  const database = getDb();
  const gb = database.prepare('SELECT * FROM group_buys WHERE id = ? AND status = ?').get(groupBuyId, 'active') as {
    id: number; product_id: number; target_qty: number; current_qty: number;
    regular_price: number; group_price: number; deadline: string; status: string;
  } | undefined;

  if (!gb) throw new Error('Group buy not found or not active');

  const product = getProductById(gb.product_id) as { name: string } | undefined;

  // Create the order
  const orderResult = database.prepare(`
    INSERT INTO orders (customer_name, customer_email, product_id, quantity, unit_price, total_price, order_type, group_buy_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'group', ?, 'pending_group')
  `).run(customerName, customerEmail, gb.product_id, quantity, gb.group_price, gb.group_price * quantity, groupBuyId);

  const orderId = orderResult.lastInsertRowid;

  // Add participant
  database.prepare(`
    INSERT INTO group_buy_participants (group_buy_id, customer_name, customer_email, quantity, order_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(groupBuyId, customerName, customerEmail, quantity, orderId);

  // Update group buy quantity
  const newQty = gb.current_qty + quantity;
  database.prepare('UPDATE group_buys SET current_qty = ? WHERE id = ?').run(newQty, groupBuyId);

  // Check if threshold reached — auto-confirm all orders
  let threshold_reached = false;
  if (newQty >= gb.target_qty) {
    database.prepare(`UPDATE group_buys SET status = 'completed' WHERE id = ?`).run(groupBuyId);
    database.prepare(`UPDATE orders SET status = 'confirmed' WHERE group_buy_id = ?`).run(groupBuyId);
    threshold_reached = true;
  }

  return { orderId, threshold_reached, product_name: product?.name };
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export function createOrder(data: {
  customer_name: string; customer_email: string; product_id: number;
  quantity: number; unit_price: number; notes?: string;
}) {
  const total_price = data.quantity * data.unit_price;
  const result = getDb().prepare(`
    INSERT INTO orders (customer_name, customer_email, product_id, quantity, unit_price, total_price, order_type, status, notes)
    VALUES (@customer_name, @customer_email, @product_id, @quantity, @unit_price, @total_price, 'individual', 'confirmed', @notes)
  `).run({ ...data, total_price, notes: data.notes || null });

  // Reduce stock
  getDb().prepare('UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?')
    .run(data.quantity, data.product_id);

  return result.lastInsertRowid;
}

export function getOrdersByEmail(email: string) {
  return getDb().prepare(`
    SELECT o.*, p.name as product_name, p.unit, s.name as supplier_name
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE o.customer_email = ?
    ORDER BY o.created_at DESC
  `).all(email);
}

export function getOrderById(id: number) {
  return getDb().prepare(`
    SELECT o.*, p.name as product_name, p.unit, s.name as supplier_name, s.phone as supplier_phone
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE o.id = ?
  `).get(id);
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

export function seedDatabase() {
  const database = getDb();

  // Check if already seeded
  const count = (database.prepare('SELECT COUNT(*) as c FROM suppliers').get() as { c: number }).c;
  if (count > 0) return { message: 'Already seeded' };

  // Suppliers
  const s1 = createSupplier({ name: 'Yossi\'s Organic Farm', description: 'Family-run organic vegetable farm since 1985. Certified organic, no pesticides.', location: 'Kibbutz Ein Hamifratz', phone: '052-1234567', email: 'yossi@farm.il', image_url: 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=400' });
  const s2 = createSupplier({ name: 'Miriam\'s Citrus Grove', description: 'Third-generation citrus grower. Oranges, lemons, grapefruits and seasonal varieties.', location: 'Moshav Beit Herut', phone: '054-9876543', email: 'miriam@citrus.il', image_url: 'https://images.unsplash.com/photo-1549488344-cbb6c34cf08b?w=400' });
  const s3 = createSupplier({ name: 'Avigail\'s Greenhouse', description: 'High-tech greenhouse tomatoes, peppers, and cucumbers. Hydroponic & soil-grown.', location: 'Arava Valley', phone: '050-5554444', email: 'avigail@greenhouse.il', image_url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400' });
  const s4 = createSupplier({ name: 'Ben\'s Herb Garden', description: 'Fresh herbs and specialty greens, harvested to order. Delivery twice a week.', location: 'Moshav Nahalal', phone: '053-7778889', email: 'ben@herbs.il', image_url: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400' });

  // Products for Yossi
  const p1 = createProduct({ supplier_id: Number(s1), name: 'Heirloom Tomatoes', category: 'Vegetables', price: 18, unit: 'kg', stock_qty: 120, description: 'Mixed heirloom tomatoes — sweet, tangy, and full of flavor', image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400' });
  const p2 = createProduct({ supplier_id: Number(s1), name: 'Sweet Corn', category: 'Vegetables', price: 12, unit: 'kg', stock_qty: 200, description: 'Fresh summer sweet corn, picked at peak sweetness', image_url: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400' });
  const p3 = createProduct({ supplier_id: Number(s1), name: 'Broccoli', category: 'Vegetables', price: 14, unit: 'kg', stock_qty: 80, description: 'Organic broccoli crowns, freshly harvested', image_url: 'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400' });

  // Products for Miriam
  const p4 = createProduct({ supplier_id: Number(s2), name: 'Navel Oranges', category: 'Fruits', price: 9, unit: 'kg', stock_qty: 500, description: 'Juicy seedless navel oranges, perfect for eating or juicing', image_url: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=400' });
  const p5 = createProduct({ supplier_id: Number(s2), name: 'Lemons', category: 'Fruits', price: 11, unit: 'kg', stock_qty: 300, description: 'Bright, fragrant lemons with thin skin and lots of juice', image_url: 'https://images.unsplash.com/photo-1582476879984-e97882b3b59a?w=400' });
  const p6 = createProduct({ supplier_id: Number(s2), name: 'Pink Grapefruit', category: 'Fruits', price: 8, unit: 'kg', stock_qty: 250, description: 'Sweet-tart pink grapefruits, excellent for breakfast', image_url: 'https://images.unsplash.com/photo-1577234286642-fc512a5f8f11?w=400' });

  // Products for Avigail
  const p7 = createProduct({ supplier_id: Number(s3), name: 'Cherry Tomatoes', category: 'Vegetables', price: 22, unit: 'kg', stock_qty: 150, description: 'Sweet cherry tomatoes, grown hydroponically for consistent flavor', image_url: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400' });
  const p8 = createProduct({ supplier_id: Number(s3), name: 'Bell Peppers (Mixed)', category: 'Vegetables', price: 20, unit: 'kg', stock_qty: 180, description: 'Red, yellow, and orange bell peppers — great for salads and cooking', image_url: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400' });
  const p9 = createProduct({ supplier_id: Number(s3), name: 'English Cucumbers', category: 'Vegetables', price: 10, unit: 'kg', stock_qty: 220, description: 'Long, seedless cucumbers with crisp texture', image_url: 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=400' });

  // Products for Ben
  const p10 = createProduct({ supplier_id: Number(s4), name: 'Fresh Basil Bunch', category: 'Herbs', price: 15, unit: 'bunch', stock_qty: 60, description: 'Large fragrant basil bunches, Genovese variety', image_url: 'https://images.unsplash.com/photo-1531944029726-de41e8a35e08?w=400' });
  const p11 = createProduct({ supplier_id: Number(s4), name: 'Mixed Herb Box', category: 'Herbs', price: 35, unit: 'box', stock_qty: 40, description: 'Seasonal herb selection: parsley, cilantro, dill, mint, and more', image_url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400' });

  // Group buys (deadline 7 days from now)
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  const deadlineStr = deadline.toISOString();

  createGroupBuy({ product_id: Number(p4), target_qty: 100, regular_price: 9, group_price: 6.5, deadline: deadlineStr });
  createGroupBuy({ product_id: Number(p2), target_qty: 80, regular_price: 12, group_price: 8, deadline: deadlineStr });
  createGroupBuy({ product_id: Number(p9), target_qty: 50, regular_price: 10, group_price: 7, deadline: deadlineStr });

  // Simulate some participation
  const gb1 = database.prepare(`SELECT id FROM group_buys WHERE product_id = ? LIMIT 1`).get(Number(p4)) as { id: number };
  database.prepare('UPDATE group_buys SET current_qty = 42 WHERE id = ?').run(gb1.id);

  const gb2 = database.prepare(`SELECT id FROM group_buys WHERE product_id = ? LIMIT 1`).get(Number(p2)) as { id: number };
  database.prepare('UPDATE group_buys SET current_qty = 61 WHERE id = ?').run(gb2.id);

  return { message: 'Database seeded successfully' };
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function createSubscription(data: {
  customer_name: string;
  customer_email: string;
  product_id: number;
  quantity: number;
  prefer_group_buy?: boolean;
  notes?: string;
}) {
  // Next run = next Monday
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
  nextMonday.setHours(8, 0, 0, 0);

  const result = getDb().prepare(`
    INSERT INTO subscriptions (customer_name, customer_email, product_id, quantity, prefer_group_buy, next_run, notes)
    VALUES (@customer_name, @customer_email, @product_id, @quantity, @prefer_group_buy, @next_run, @notes)
  `).run({
    ...data,
    prefer_group_buy: data.prefer_group_buy !== false ? 1 : 0,
    next_run: nextMonday.toISOString(),
    notes: data.notes || null,
  });
  return result.lastInsertRowid;
}

export function getSubscriptionsByEmail(email: string) {
  return getDb().prepare(`
    SELECT s.*, p.name as product_name, p.unit, p.price as current_price,
           p.image_url, p.category,
           sup.name as supplier_name
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    JOIN suppliers sup ON sup.id = p.supplier_id
    WHERE s.customer_email = ? AND s.active = 1
    ORDER BY s.created_at DESC
  `).all(email);
}

export function getAllActiveSubscriptions() {
  return getDb().prepare(`
    SELECT s.*, p.name as product_name, p.unit, p.price as current_price, p.stock_qty,
           p.category, sup.name as supplier_name
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    JOIN suppliers sup ON sup.id = p.supplier_id
    WHERE s.active = 1 AND s.next_run <= datetime('now')
    ORDER BY s.next_run ASC
  `).all();
}

export function deactivateSubscription(id: number) {
  getDb().prepare('UPDATE subscriptions SET active = 0 WHERE id = ?').run(id);
}

export function updateSubscriptionAfterRun(id: number, orderId: number | bigint) {
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
  nextMonday.setHours(8, 0, 0, 0);

  getDb().prepare(`
    UPDATE subscriptions
    SET last_run = datetime('now'), last_order_id = ?, next_run = ?
    WHERE id = ?
  `).run(orderId, nextMonday.toISOString(), id);
}

export function getSubscriptionRunLog() {
  return getDb().prepare(`
    SELECT s.id, s.customer_name, s.customer_email, s.quantity,
           p.name as product_name, p.unit,
           o.total_price, o.order_type, o.status, o.created_at as order_date
    FROM subscriptions s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN orders o ON o.id = s.last_order_id
    WHERE s.last_order_id IS NOT NULL
    ORDER BY o.created_at DESC
    LIMIT 50
  `).all();
}
