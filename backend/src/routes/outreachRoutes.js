import { Router } from 'express';
import { suggest } from '../controllers/outreachController.js';
import { defaultUser } from '../middleware/defaultUser.js';
import { validate, outreachValidation } from '../middleware/validator.js';

const router = Router();

router.use(defaultUser);

router.get('/suggest/:leadId', validate(outreachValidation.suggest), suggest);

export default router;
