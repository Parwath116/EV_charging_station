import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  createBookingSchema,
  rescheduleBookingSchema,
  estimateCostSchema,
} from '../validations/booking.validation.js';

const router = Router();

// Public / Authenticated Cost Estimator
router.get('/estimate', validateQuery(estimateCostSchema), (req, res, next) =>
  bookingController.estimate(req, res, next)
);

// All other booking operations require authentication
router.use(authenticate);

router.get('/', (req, res, next) => bookingController.list(req, res, next));
router.post('/', validateBody(createBookingSchema), (req, res, next) =>
  bookingController.create(req, res, next)
);
router.patch('/:id/cancel', (req, res, next) => bookingController.cancel(req, res, next));
router.patch('/:id/reschedule', validateBody(rescheduleBookingSchema), (req, res, next) =>
  bookingController.reschedule(req, res, next)
);

export default router;
