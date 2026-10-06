import { Router } from 'express';
import { AlertController } from '../controllers/alert.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Restricted to Admins & Station Operators
router.use(authenticate, requireRole('admin', 'operator'));

router.get('/', AlertController.list);
router.get('/unread-count', AlertController.unreadCount);
router.patch('/:id/resolve', AlertController.resolve);

export default router;
