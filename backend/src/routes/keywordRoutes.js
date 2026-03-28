import { Router } from 'express';
import { getAll, create, update, remove } from '../controllers/keywordController.js';
import { defaultUser } from '../middleware/defaultUser.js';
import { validate, keywordValidation } from '../middleware/validator.js';

const router = Router();

router.use(defaultUser);

router.get('/', getAll);
router.post('/', validate(keywordValidation.create), create);
router.put('/:id', validate(keywordValidation.update), update);
router.delete('/:id', validate(keywordValidation.delete), remove);

export default router;
