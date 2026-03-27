import { Router } from 'express';
import { suggest } from '../controllers/outreachController.js';
import { authenticate } from '../middleware/auth.js';
import { validate, outreachValidation } from '../middleware/validator.js';

const router = Router();

router.use(authenticate);

router.get('/suggest/:leadId', validate(outreachValidation.suggest), suggest);

export default router;
