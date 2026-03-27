import { getDatabase } from '../config/database.js';

class Keyword {
  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM keywords WHERE id = ?').get(id);
  }

  static findByUserId(userId, { activeOnly = false } = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM keywords WHERE user_id = ?';
    if (activeOnly) query += ' AND is_active = 1';
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(userId);
  }

  static create({ userId, term, category = 'general' }) {
    const db = getDatabase();
    const stmt = db.prepare('INSERT INTO keywords (user_id, term, category) VALUES (?, ?, ?)');
    const result = stmt.run(userId, term, category);
    return Keyword.findById(result.lastInsertRowid);
  }

  static update(id, { term, category, isActive }) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    if (term !== undefined) { fields.push('term = ?'); values.push(term); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (fields.length === 0) return null;
    values.push(id);
    db.prepare(`UPDATE keywords SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return Keyword.findById(id);
  }

  static delete(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static findByUserIdAndOwnership(id, userId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM keywords WHERE id = ? AND user_id = ?').get(id, userId);
  }
}

export default Keyword;
