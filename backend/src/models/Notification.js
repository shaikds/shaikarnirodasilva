import { getDatabase } from '../config/database.js';

class Notification {
  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  }

  static findByUserId(userId, { unreadOnly = false, limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];
    if (unreadOnly) query += ' AND is_read = 0';
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return db.prepare(query).all(...params);
  }

  static countUnread(userId) {
    const db = getDatabase();
    return db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).count;
  }

  static create({ userId, leadId, type, title, message }) {
    const db = getDatabase();
    const stmt = db.prepare(
      'INSERT INTO notifications (user_id, lead_id, type, title, message) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(userId, leadId || null, type, title, message);
    return Notification.findById(result.lastInsertRowid);
  }

  static markAsRead(id) {
    const db = getDatabase();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    return Notification.findById(id);
  }

  static markAllAsRead(userId) {
    const db = getDatabase();
    const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
    return result.changes;
  }

  static findByUserIdAndOwnership(id, userId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);
  }
}

export default Notification;
