import { getDatabase } from '../config/database.js';

class OutreachTemplate {
  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM outreach_templates WHERE id = ?').get(id);
  }

  static findByUserId(userId, { category } = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM outreach_templates WHERE user_id = ?';
    const params = [userId];
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  }

  static create({ userId, name, template, category = 'general' }) {
    const db = getDatabase();
    const stmt = db.prepare(
      'INSERT INTO outreach_templates (user_id, name, template, category) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(userId, name, template, category);
    return OutreachTemplate.findById(result.lastInsertRowid);
  }

  static update(id, { name, template, category }) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (template !== undefined) { fields.push('template = ?'); values.push(template); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (fields.length === 0) return null;
    values.push(id);
    db.prepare(`UPDATE outreach_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return OutreachTemplate.findById(id);
  }

  static delete(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM outreach_templates WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export default OutreachTemplate;
