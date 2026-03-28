import Keyword from '../models/Keyword.js';
import { sanitizeString } from '../utils/sanitizer.js';
import logger from '../utils/logger.js';

export async function getAll(req, res, next) {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const keywords = Keyword.findByUserId(req.user.id, { activeOnly });
    res.json({ keywords });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const term = sanitizeString(req.body.term);
    const category = req.body.category ? sanitizeString(req.body.category) : 'general';

    const keyword = Keyword.create({ userId: req.user.id, term, category });
    logger.info('Keyword created', { userId: req.user.id, keywordId: keyword.id, term });

    res.status(201).json({ keyword });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { id } = req.params;
    const existing = Keyword.findByUserIdAndOwnership(Number(id), req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Keyword not found.' });
    }

    const updates = {};
    if (req.body.term !== undefined) updates.term = sanitizeString(req.body.term);
    if (req.body.category !== undefined) updates.category = sanitizeString(req.body.category);
    const isActive = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;
    if (isActive !== undefined) updates.isActive = isActive;

    const keyword = Keyword.update(Number(id), updates);
    logger.info('Keyword updated', { userId: req.user.id, keywordId: id });

    res.json({ keyword });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const existing = Keyword.findByUserIdAndOwnership(Number(id), req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Keyword not found.' });
    }

    Keyword.delete(Number(id));
    logger.info('Keyword deleted', { userId: req.user.id, keywordId: id });

    res.json({ message: 'Keyword deleted.' });
  } catch (err) {
    next(err);
  }
}

export default { getAll, create, update, remove };
