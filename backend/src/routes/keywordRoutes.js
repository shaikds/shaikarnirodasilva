import { Router } from 'express';
import { getAll, create, update, remove } from '../controllers/keywordController.js';
import { authenticate } from '../middleware/auth.js';
import { validate, keywordValidation } from '../middleware/validator.js';

const router = Router();

router.use(authenticate);

router.get('/', getAll);
router.post('/', validate(keywordValidation.create), create);
router.put('/:id', validate(keywordValidation.update), update);
router.delete('/:id', validate(keywordValidation.delete), remove);

export default router;
