import { getDatabase } from '../config/database.js';

class Lead {
  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  }

  static findByUserId(userId, { status, platform, minScore, limit = 50, offset = 0, sortBy = 'discovered_at', sortOrder = 'DESC' } = {}) {
    const db = getDatabase();
    const conditions = ['user_id = ?'];
    const params = [userId];

    if (status) { conditions.push('status = ?'); params.push(status); }
    if (platform) { conditions.push('platform = ?'); params.push(platform); }
    if (minScore !== undefined) { conditions.push('score >= ?'); params.push(minScore); }

    const allowedSorts = ['discovered_at', 'score', 'status', 'platform'];
    const allowedOrders = ['ASC', 'DESC'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'discovered_at';
    const safeOrder = allowedOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const query = `SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    return db.prepare(query).all(...params);
  }

  static countByUserId(userId, { status, platform, minScore } = {}) {
    const db = getDatabase();
    const conditions = ['user_id = ?'];
    const params = [userId];
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (platform) { conditions.push('platform = ?'); params.push(platform); }
    if (minScore !== undefined) { conditions.push('score >= ?'); params.push(minScore); }
    const query = `SELECT COUNT(*) as count FROM leads WHERE ${conditions.join(' AND ')}`;
    return db.prepare(query).get(...params).count;
  }

  static create({ userId, platform, author, authorUrl, content, sourceUrl, matchedKeywords, score, status = 'new' }) {
    const db = getDatabase();
    const stmt = db.prepare(
      `INSERT INTO leads (user_id, platform, author, author_url, content, source_url, matched_keywords, score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(userId, platform, author, authorUrl, content, sourceUrl, matchedKeywords, score, status);
    return Lead.findById(result.lastInsertRowid);
  }

  static createMany(leads) {
    const db = getDatabase();
    const stmt = db.prepare(
      `INSERT INTO leads (user_id, platform, author, author_url, content, source_url, matched_keywords, score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMany = db.transaction((items) => {
      const results = [];
      for (const lead of items) {
        const result = stmt.run(
          lead.userId, lead.platform, lead.author, lead.authorUrl,
          lead.content, lead.sourceUrl, lead.matchedKeywords, lead.score, lead.status || 'new'
        );
        results.push(result.lastInsertRowid);
      }
      return results;
    });
    return insertMany(leads);
  }

  static update(id, { status, notes, score }) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
    if (score !== undefined) { fields.push('score = ?'); values.push(score); }
    if (fields.length === 0) return null;
    values.push(id);
    db.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return Lead.findById(id);
  }

  static findByUserIdAndOwnership(id, userId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM leads WHERE id = ? AND user_id = ?').get(id, userId);
  }

  static existsBySourceUrl(sourceUrl, userId) {
    const db = getDatabase();
    const row = db.prepare('SELECT id FROM leads WHERE source_url = ? AND user_id = ?').get(sourceUrl, userId);
    return !!row;
  }

  static getStatsByUserId(userId) {
    const db = getDatabase();
    const total = db.prepare('SELECT COUNT(*) as count FROM leads WHERE user_id = ?').get(userId).count;
    const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM leads WHERE user_id = ? GROUP BY status').all(userId);
    const byPlatform = db.prepare('SELECT platform, COUNT(*) as count FROM leads WHERE user_id = ? GROUP BY platform').all(userId);
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM leads WHERE user_id = ?').get(userId).avg || 0;
    const scoreDistribution = db.prepare(`
      SELECT
        CASE
          WHEN score >= 80 THEN 'hot'
          WHEN score >= 50 THEN 'warm'
          ELSE 'cold'
        END as tier,
        COUNT(*) as count
      FROM leads WHERE user_id = ? GROUP BY tier
    `).all(userId);
    const recent = db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY discovered_at DESC LIMIT 10').all(userId);

    return { total, byStatus, byPlatform, avgScore: Math.round(avgScore), scoreDistribution, recent };
  }
}

export default Lead;
