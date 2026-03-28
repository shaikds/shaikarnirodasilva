import Lead from '../models/Lead.js';
import Keyword from '../models/Keyword.js';
import Notification from '../models/Notification.js';
import { getDatabase } from '../config/database.js';

export async function getStats(req, res, next) {
  try {
    const userId = req.user.id;
    const leadStats = Lead.getStatsByUserId(userId);
    const keywordCount = Keyword.findByUserId(userId).length;
    const activeKeywordCount = Keyword.findByUserId(userId, { activeOnly: true }).length;
    const unreadNotifications = Notification.countUnread(userId);

    const db = getDatabase();

    // Count leads discovered today
    const newToday = db.prepare(
      "SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND date(discovered_at) = date('now')"
    ).get(userId).count;

    // Count high-score leads (score >= 70)
    const highScoreLeads = db.prepare(
      'SELECT COUNT(*) as count FROM leads WHERE user_id = ? AND score >= 70'
    ).get(userId).count;

    // Chart data: leads per day for last 7 days
    const chartData = db.prepare(`
      SELECT date(discovered_at) as date, COUNT(*) as count
      FROM leads
      WHERE user_id = ? AND discovered_at >= datetime('now', '-7 days')
      GROUP BY date(discovered_at)
      ORDER BY date(discovered_at) ASC
    `).all(userId);

    const recentJobs = db.prepare(
      'SELECT * FROM scrape_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(userId);

    res.json({
      stats: {
        totalLeads: leadStats.total,
        newToday,
        highScoreLeads,
        activeKeywords: activeKeywordCount,
        avgScore: leadStats.avgScore,
        byStatus: leadStats.byStatus,
        byPlatform: leadStats.byPlatform,
        scoreDistribution: leadStats.scoreDistribution,
        keywordCount,
        activeKeywordCount,
        unreadNotifications,
        chartData,
        recentLeads: leadStats.recent,
        recentJobs,
      },
    });
  } catch (err) {
    next(err);
  }
}

export default { getStats };
