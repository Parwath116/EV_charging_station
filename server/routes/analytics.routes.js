import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('admin', 'operator'));

// Aggregation endpoints
router.get('/peak-hours', (req, res, next) => analyticsController.getPeakHours(req, res, next));
router.get('/stations', (req, res, next) =>
  analyticsController.getStationsPerformance(req, res, next)
);
router.get('/area-breakdown', (req, res, next) =>
  analyticsController.getAreaBreakdown(req, res, next)
);
router.get('/duration-distribution', (req, res, next) =>
  analyticsController.getDurationDistribution(req, res, next)
);
router.get('/rolling-average', (req, res, next) =>
  analyticsController.getRollingAverage(req, res, next)
);
router.get('/expansion-suggestions', (req, res, next) =>
  analyticsController.getSuggestedLocations(req, res, next)
);

// Pipeline $merge execution
router.post('/refresh-daily-stats', requireRole('admin'), (req, res, next) =>
  analyticsController.refreshDailyStats(req, res, next)
);

// CSV Data Exports
router.get('/export/stations-csv', (req, res, next) =>
  analyticsController.exportStationsCSV(req, res, next)
);
router.get('/export/revenue-csv', (req, res, next) =>
  analyticsController.exportRevenueCSV(req, res, next)
);

export default router;
