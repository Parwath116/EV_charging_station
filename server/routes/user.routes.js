import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Profile
router.get('/profile', (req, res, next) => userController.getProfile(req, res, next));
router.put('/profile', (req, res, next) => userController.updateProfile(req, res, next));

// Vehicles (Embedded Array $push / $pull)
router.post('/vehicles', (req, res, next) => userController.addVehicle(req, res, next));
router.delete('/vehicles/:model', (req, res, next) => userController.removeVehicle(req, res, next));

// Wallet Balance ($inc atomic operation)
router.post('/wallet/topup', (req, res, next) => userController.topUpWallet(req, res, next));

// Favourite Stations ($addToSet / $pull)
router.post('/favourites/:stationId', (req, res, next) =>
  userController.addFavourite(req, res, next)
);
router.delete('/favourites/:stationId', (req, res, next) =>
  userController.removeFavourite(req, res, next)
);

// Admin & Operator Audit Log Trail
router.get('/audit-logs', requireRole('admin', 'operator'), (req, res, next) =>
  userController.getAuditLogs(req, res, next)
);

// Admin User Governance & Schema Maintenance
router.get('/', requireRole('admin'), (req, res, next) => userController.listUsers(req, res, next));
router.post('/unset-field', requireRole('admin'), (req, res, next) =>
  userController.unsetField(req, res, next)
);
router.post('/rename-field', requireRole('admin'), (req, res, next) =>
  userController.renameField(req, res, next)
);

export default router;
