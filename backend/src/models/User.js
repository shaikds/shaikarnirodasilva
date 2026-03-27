import { getDatabase } from '../config/database.js';

class User {
  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
  }

  static findByEmail(email) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  static create({ email, passwordHash, name }) {
    const db = getDatabase();
    const stmt = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)');
    const result = stmt.run(email, passwordHash, name);
    return { id: result.lastInsertRowid, email, name };
  }

  static update(id, { name, email }) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (fields.length === 0) return null;
    values.push(id);
    const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return User.findById(id);
  }
}

export default User;
