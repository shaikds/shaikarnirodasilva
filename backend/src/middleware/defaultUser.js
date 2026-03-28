import { getDatabase } from '../config/database.js';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';

const DEFAULT_USER = {
  id: 1,
  email: 'default@localhost',
  name: 'User',
};

let initialized = false;

function ensureDefaultUser() {
  if (initialized) return;
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!existing) {
    const hash = bcrypt.hashSync('not-used', 10);
    db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      1, DEFAULT_USER.email, hash, DEFAULT_USER.name
    );
    logger.info('Default user created');
  }
  initialized = true;
}

export function defaultUser(req, _res, next) {
  ensureDefaultUser();
  req.user = { id: DEFAULT_USER.id, email: DEFAULT_USER.email };
  next();
}
