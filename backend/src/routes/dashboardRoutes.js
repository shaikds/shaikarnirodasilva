import { Router } from 'express';
import { getStats } from '../controllers/dashboardController.js';
import { defaultUser } from '../middleware/defaultUser.js';

const router = Router();

router.use(defaultUser);

router.get('/stats', getStats);

export default router;
