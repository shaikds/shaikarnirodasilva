import cron from 'node-cron';
import scraperFactory from './scrapers/ScraperFactory.js';
import LeadScoringEngine from './LeadScoringEngine.js';
import KeywordEngine from './KeywordEngine.js';
import notificationService from './NotificationService.js';
import Keyword from '../models/Keyword.js';
import Lead from '../models/Lead.js';
import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

class SchedulerService {
  constructor() {
    this._jobs = new Map();
  }

  /**
   * Start the default periodic scraping schedule.
   * Runs every 6 hours by default.
   */
  startDefaultSchedule() {
    const cronExpression = '0 */6 * * *';

    const task = cron.schedule(cronExpression, async () => {
      logger.info('Scheduled scrape starting');
      await this._runScrapeForAllUsers();
    }, { scheduled: true });

    this._jobs.set('default', task);
    logger.info('Default scrape schedule started (every 6 hours)');
  }

  /**
   * Schedule a custom cron job.
   * @param {string} name - Job name
   * @param {string} cronExpression - Cron expression
   * @param {Function} handler - Async function to execute
   */
  schedule(name, cronExpression, handler) {
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    if (this._jobs.has(name)) {
      this._jobs.get(name).stop();
    }

    const task = cron.schedule(cronExpression, handler, { scheduled: true });
    this._jobs.set(name, task);
    logger.info(`Scheduled job "${name}" with expression "${cronExpression}"`);
  }

  /**
   * Stop a scheduled job.
   * @param {string} name
   */
  stop(name) {
    const task = this._jobs.get(name);
    if (task) {
      task.stop();
      this._jobs.delete(name);
      logger.info(`Stopped job "${name}"`);
    }
  }

  /**
   * Stop all scheduled jobs.
   */
  stopAll() {
    for (const [name, task] of this._jobs) {
      task.stop();
      logger.info(`Stopped job "${name}"`);
    }
    this._jobs.clear();
  }

  /**
   * Run a scrape for a specific user.
   * @param {number} userId
   * @param {string} platform - 'reddit', 'web', or 'all'
   * @param {object} options - Scraper-specific options
   * @returns {Promise<{ jobId: number, leadsFound: number }>}
   */
  async runScrapeForUser(userId, platform = 'all', options = {}) {
    const db = getDatabase();
    const keywords = Keyword.findByUserId(userId, { activeOnly: true });

    if (keywords.length === 0) {
      throw new Error('No active keywords configured. Add keywords before scraping.');
    }

    const keywordTerms = keywords.map(k => k.term);
    const scrapers = platform === 'all'
      ? scraperFactory.createAll()
      : [scraperFactory.create(platform)];

    let totalLeads = 0;

    for (const scraper of scrapers) {
      const jobStmt = db.prepare(
        'INSERT INTO scrape_jobs (user_id, platform, status, started_at) VALUES (?, ?, ?, datetime("now"))'
      );
      const job = jobStmt.run(userId, scraper.getName(), 'running');
      const jobId = job.lastInsertRowid;

      try {
        const rawResults = await scraper.scrape(keywordTerms, options);
        const leadsToInsert = [];

        for (const raw of rawResults) {
          const parsed = await scraper.parseLead(raw);

          if (Lead.existsBySourceUrl(parsed.sourceUrl, userId)) continue;

          const matchResult = KeywordEngine.match(parsed.content, keywordTerms);
          if (!matchResult.matched) continue;

          const score = LeadScoringEngine.score(parsed, keywordTerms);

          leadsToInsert.push({
            userId,
            platform: parsed.platform,
            author: parsed.author,
            authorUrl: parsed.authorUrl,
            content: parsed.content,
            sourceUrl: parsed.sourceUrl,
            matchedKeywords: matchResult.matchedKeywords.join(', '),
            score,
            status: 'new',
          });
        }

        if (leadsToInsert.length > 0) {
          const insertedIds = Lead.createMany(leadsToInsert);
          totalLeads += insertedIds.length;

          notificationService.notifyNewLeads(userId, insertedIds.length, scraper.getName());

          for (let i = 0; i < leadsToInsert.length; i++) {
            if (leadsToInsert[i].score >= 70) {
              notificationService.notifyHighScoreLead(userId, insertedIds[i], leadsToInsert[i].score);
            }
          }
        }

        db.prepare(
          'UPDATE scrape_jobs SET status = ?, results_count = ?, completed_at = datetime("now") WHERE id = ?'
        ).run('completed', leadsToInsert.length, jobId);

        notificationService.notifyScrapeComplete(userId, scraper.getName(), leadsToInsert.length);

      } catch (err) {
        logger.error(`Scrape job ${jobId} failed`, { error: err.message, platform: scraper.getName() });
        db.prepare(
          'UPDATE scrape_jobs SET status = ?, completed_at = datetime("now") WHERE id = ?'
        ).run('failed', jobId);
      }
    }

    return { leadsFound: totalLeads };
  }

  async _runScrapeForAllUsers() {
    try {
      const db = getDatabase();
      const users = db.prepare('SELECT id FROM users').all();

      for (const user of users) {
        try {
          await this.runScrapeForUser(user.id, 'all');
        } catch (err) {
          logger.error(`Scheduled scrape failed for user ${user.id}`, { error: err.message });
        }
      }
    } catch (err) {
      logger.error('Scheduled scrape batch failed', { error: err.message });
    }
  }
}

const schedulerService = new SchedulerService();
export default schedulerService;
