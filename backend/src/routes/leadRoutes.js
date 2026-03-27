import { Router } from 'express';
import { getAll, getById, update, triggerScrape } from '../controllers/leadController.js';
import { authenticate } from '../middleware/auth.js';
import { validate, leadValidation } from '../middleware/validator.js';
import { scrapeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(authenticate);

router.get('/', validate(leadValidation.getAll), getAll);
router.post('/scrape', scrapeLimiter, validate(leadValidation.scrape), triggerScrape);
router.get('/:id', validate(leadValidation.getById), getById);
router.patch('/:id', validate(leadValidation.update), update);

export default router;
