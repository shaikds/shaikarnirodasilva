import { body, param, query, validationResult } from 'express-validator';

export function validate(validations) {
  return async (req, res, next) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    return res.status(400).json({ errors: errors.array().map(e => ({ field: e.path, message: e.msg })) });
  };
}

export const authValidation = {
  register: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[0-9]/).withMessage('Password must contain a number'),
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 chars)'),
  ],
  login: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
};

export const keywordValidation = {
  create: [
    body('term').trim().isLength({ min: 1, max: 200 }).withMessage('Term is required (max 200 chars)'),
    body('category').optional().trim().isLength({ max: 50 }).withMessage('Category max 50 chars'),
  ],
  update: [
    param('id').isInt({ min: 1 }).withMessage('Valid keyword ID required'),
    body('term').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Term max 200 chars'),
    body('category').optional().trim().isLength({ max: 50 }).withMessage('Category max 50 chars'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
  ],
  delete: [
    param('id').isInt({ min: 1 }).withMessage('Valid keyword ID required'),
  ],
};

export const leadValidation = {
  getById: [
    param('id').isInt({ min: 1 }).withMessage('Valid lead ID required'),
  ],
  getAll: [
    query('status').optional().isIn(['new', 'contacted', 'qualified', 'converted', 'archived']).withMessage('Invalid status'),
    query('platform').optional().trim().isLength({ max: 50 }),
    query('minScore').optional().isInt({ min: 0, max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
    query('sortBy').optional().isIn(['discovered_at', 'score', 'status', 'platform']),
    query('sortOrder').optional().isIn(['ASC', 'DESC', 'asc', 'desc']),
  ],
  update: [
    param('id').isInt({ min: 1 }).withMessage('Valid lead ID required'),
    body('status').optional().isIn(['new', 'contacted', 'qualified', 'converted', 'archived']).withMessage('Invalid status'),
    body('notes').optional().trim().isLength({ max: 5000 }).withMessage('Notes max 5000 chars'),
  ],
  scrape: [
    body('platform').optional().isIn(['reddit', 'web', 'all']).withMessage('Invalid platform'),
    body('subreddits').optional().isArray({ max: 20 }).withMessage('Subreddits must be an array (max 20)'),
    body('subreddits.*').optional().isString().trim().isLength({ min: 1, max: 50 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Each subreddit must be a valid name (alphanumeric, max 50 chars)'),
  ],
};

export const notificationValidation = {
  markRead: [
    param('id').isInt({ min: 1 }).withMessage('Valid notification ID required'),
  ],
};

export const outreachValidation = {
  suggest: [
    param('leadId').isInt({ min: 1 }).withMessage('Valid lead ID required'),
  ],
};

export default {
  validate,
  authValidation,
  keywordValidation,
  leadValidation,
  notificationValidation,
  outreachValidation,
};
