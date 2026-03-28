import { Router } from 'express';
import { getAll, markAsRead, markAllAsRead } from '../controllers/notificationController.js';
import { defaultUser } from '../middleware/defaultUser.js';
import { validate, notificationValidation } from '../middleware/validator.js';

const router = Router();

router.use(defaultUser);

router.get('/', getAll);
router.patch('/:id/read', validate(notificationValidation.markRead), markAsRead);
router.post('/read-all', markAllAsRead);

export default router;
