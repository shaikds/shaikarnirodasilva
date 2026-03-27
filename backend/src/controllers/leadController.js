import Lead from '../models/Lead.js';
import schedulerService from '../services/SchedulerService.js';
import { sanitizeString } from '../utils/sanitizer.js';
import logger from '../utils/logger.js';

export async function getAll(req, res, next) {
  try {
    const { status, platform, minScore, limit, offset, sortBy, sortOrder } = req.query;

    const filters = {
      status,
      platform,
      minScore: minScore !== undefined ? Number(minScore) : undefined,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      sortBy,
      sortOrder,
    };

    const leads = Lead.findByUserId(req.user.id, filters);
    const total = Lead.countByUserId(req.user.id, filters);

    res.json({ leads, total, limit: filters.limit, offset: filters.offset });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const lead = Lead.findByUserIdAndOwnership(Number(req.params.id), req.user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    res.json({ lead });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { id } = req.params;
    const existing = Lead.findByUserIdAndOwnership(Number(id), req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    const updates = {};
    if (req.body.status !== undefined) updates.status = req.body.status;
    if (req.body.notes !== undefined) updates.notes = sanitizeString(req.body.notes);

    const lead = Lead.update(Number(id), updates);
    logger.info('Lead updated', { userId: req.user.id, leadId: id, updates: Object.keys(updates) });

    res.json({ lead });
  } catch (err) {
    next(err);
  }
}

export async function triggerScrape(req, res, next) {
  try {
    const platform = req.body.platform || 'all';
    const options = {};

    if (req.body.subreddits) {
      options.subreddits = req.body.subreddits;
    }

    logger.info('Scrape triggered', { userId: req.user.id, platform });

    const result = await schedulerService.runScrapeForUser(req.user.id, platform, options);

    res.json({
      message: `Scrape completed. Found ${result.leadsFound} new leads.`,
      leadsFound: result.leadsFound,
    });
  } catch (err) {
    if (err.message.includes('No active keywords')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

export default { getAll, getById, update, triggerScrape };
