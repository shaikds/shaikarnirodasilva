import { Router } from 'express';
import { getAll, markAsRead, markAllAsRead } from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';
import { validate, notificationValidation } from '../middleware/validator.js';

const router = Router();

router.use(authenticate);

router.get('/', getAll);
router.patch('/:id/read', validate(notificationValidation.markRead), markAsRead);
router.post('/read-all', markAllAsRead);

export default router;
