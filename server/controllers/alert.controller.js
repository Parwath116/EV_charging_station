import { AlertService } from '../services/alert.service.js';

export class AlertController {
  static async list(req, res, next) {
    try {
      const { stationId, severity, type, acknowledged, limit, skip } = req.query;
      const filters = {
        stationId,
        severity,
        type,
        acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
        limit: limit ? parseInt(limit, 10) : 20,
        skip: skip ? parseInt(skip, 10) : 0,
      };

      const result = await AlertService.listAlerts(filters);
      res.json({
        success: true,
        data: result.alerts,
        pagination: {
          total: result.total,
          limit: result.limit,
          skip: result.skip,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async unreadCount(req, res, next) {
    try {
      const count = await AlertService.getUnreadCount();
      res.json({
        success: true,
        data: { count },
      });
    } catch (err) {
      next(err);
    }
  }

  static async resolve(req, res, next) {
    try {
      const { id } = req.params;
      const actorId = req.user ? req.user._id : 'system';
      const ip = req.ip || req.connection.remoteAddress;

      const updated = await AlertService.resolveAlert(id, actorId, ip);
      res.json({
        success: true,
        message: 'Alert acknowledged and resolved successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}
