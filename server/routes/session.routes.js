import { Router } from 'express';
import { sessionController } from '../controllers/session.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  startSessionSchema,
  stopSessionSchema,
  telemetryPayloadSchema,
} from '../validations/session.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => sessionController.list(req, res, next));
router.get('/active', (req, res, next) => sessionController.getActive(req, res, next));
router.post('/start', validateBody(startSessionSchema), (req, res, next) =>
  sessionController.start(req, res, next)
);
router.post('/:id/stop', validateBody(stopSessionSchema), (req, res, next) =>
  sessionController.stop(req, res, next)
);
router.post('/telemetry', validateBody(telemetryPayloadSchema), (req, res, next) =>
  sessionController.telemetry(req, res, next)
);

export default router;
