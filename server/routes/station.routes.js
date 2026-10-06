import { Router } from 'express';
import { stationController } from '../controllers/station.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  createStationSchema,
  updateStationSchema,
  nearestQuerySchema,
  geoWithinCircleSchema,
} from '../validations/station.validation.js';

const router = Router();

// Public Discovery Endpoints
router.get('/', (req, res, next) => stationController.list(req, res, next));
router.get('/nearest', validateQuery(nearestQuerySchema), (req, res, next) =>
  stationController.getNearest(req, res, next)
);
router.get('/within-circle', validateQuery(geoWithinCircleSchema), (req, res, next) =>
  stationController.getWithinCircle(req, res, next)
);
router.post('/within-polygon', (req, res, next) =>
  stationController.getWithinPolygon(req, res, next)
);
router.get('/:id', (req, res, next) => stationController.getById(req, res, next));

// Administrative & Operator Management Endpoints
router.post(
  '/',
  authenticate,
  requireRole('admin', 'operator'),
  validateBody(createStationSchema),
  (req, res, next) => stationController.create(req, res, next)
);

router.post('/bulk-import', authenticate, requireRole('admin'), (req, res, next) =>
  stationController.bulkImport(req, res, next)
);

router.put(
  '/:id',
  authenticate,
  requireRole('admin', 'operator'),
  validateBody(updateStationSchema),
  (req, res, next) => stationController.update(req, res, next)
);

router.patch('/:id/tariff', authenticate, requireRole('admin', 'operator'), (req, res, next) =>
  stationController.updateTariff(req, res, next)
);

router.patch('/:id/status', authenticate, requireRole('admin', 'operator'), (req, res, next) =>
  stationController.toggleStatus(req, res, next)
);

router.patch(
  '/:id/decommission',
  authenticate,
  requireRole('admin', 'operator'),
  (req, res, next) => stationController.softDelete(req, res, next)
);

router.delete('/:id', authenticate, requireRole('admin'), (req, res, next) =>
  stationController.hardDelete(req, res, next)
);

// Charger Bays Embedded Array Operations ($push, $pull, arrayFilters, bulkWrite)
router.post('/:id/chargers', authenticate, requireRole('admin', 'operator'), (req, res, next) =>
  stationController.addCharger(req, res, next)
);

router.delete(
  '/:id/chargers/:chargerId',
  authenticate,
  requireRole('admin', 'operator'),
  (req, res, next) => stationController.removeCharger(req, res, next)
);

router.patch(
  '/:id/chargers/:chargerId',
  authenticate,
  requireRole('admin', 'operator'),
  (req, res, next) => stationController.updateCharger(req, res, next)
);

router.post(
  '/:id/chargers/bulk-sync',
  authenticate,
  requireRole('admin', 'operator'),
  (req, res, next) => stationController.bulkSyncChargers(req, res, next)
);

export default router;
