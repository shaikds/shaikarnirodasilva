import { Router } from 'express';
import { getAll, getById, update, triggerScrape } from '../controllers/leadController.js';
import { defaultUser } from '../middleware/defaultUser.js';
import { validate, leadValidation } from '../middleware/validator.js';
import { scrapeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(defaultUser);

router.get('/', validate(leadValidation.getAll), getAll);
router.post('/scrape', scrapeLimiter, validate(leadValidation.scrape), triggerScrape);
router.get('/:id', validate(leadValidation.getById), getById);
router.patch('/:id', validate(leadValidation.update), update);

export default router;
