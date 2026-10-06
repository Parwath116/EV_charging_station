import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
} from '../validations/auth.validation.js';

const router = Router();

router.post('/register', authLimiter, validateBody(registerSchema), (req, res, next) =>
  authController.register(req, res, next)
);

router.post('/login', authLimiter, validateBody(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);

router.post('/logout', (req, res, next) => authController.logout(req, res, next));

router.get('/me', authenticate, (req, res, next) => authController.getMe(req, res, next));

router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  (req, res, next) => authController.changePassword(req, res, next)
);

export default router;
