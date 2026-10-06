import { Router } from 'express';
import { LabController } from '../controllers/lab.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Strictly Admin-Only
router.use(authenticate, requireRole('admin'));

router.post('/explain', LabController.explain);
router.get('/index-comparison', LabController.indexComparison);
router.post('/validate-demo', LabController.validateDemo);
router.post('/transaction-demo', LabController.transactionDemo);
router.get('/schema-summary', LabController.schemaSummary);

export default router;
