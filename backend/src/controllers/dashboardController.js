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
    const recentJobs = db.prepare(
      'SELECT * FROM scrape_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(userId);

    res.json({
      stats: {
        totalLeads: leadStats.total,
        avgScore: leadStats.avgScore,
        byStatus: leadStats.byStatus,
        byPlatform: leadStats.byPlatform,
        scoreDistribution: leadStats.scoreDistribution,
        keywordCount,
        activeKeywordCount,
        unreadNotifications,
        recentLeads: leadStats.recent,
        recentJobs,
      },
    });
  } catch (err) {
    next(err);
  }
}

export default { getStats };
