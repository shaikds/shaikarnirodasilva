import { Router } from 'express';
import { register, login, getProfile } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate, authValidation } from '../middleware/validator.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, validate(authValidation.register), register);
router.post('/login', authLimiter, validate(authValidation.login), login);
router.get('/profile', authenticate, getProfile);

export default router;
