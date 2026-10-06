import { sessionService } from '../services/session.service.js';

export class SessionController {
  async start(req, res, next) {
    try {
      const session = await sessionService.startSession(req.body, req.user._id, req.ip);
      res.status(201).json({
        success: true,
        data: session,
        message: 'Charging session started successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async stop(req, res, next) {
    try {
      const session = await sessionService.stopSession(
        {
          sessionId: req.params.id,
          finalEnergyKWh: req.body.finalEnergyKWh,
        },
        req.user._id,
        req.user.role,
        req.ip
      );

      res.status(200).json({
        success: true,
        data: session,
        message: 'Charging session completed and billed',
      });
    } catch (error) {
      next(error);
    }
  }

  async getActive(req, res, next) {
    try {
      const session = await sessionService.getActiveSession(req.user._id);
      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const result = await sessionService.getSessions({
        filter: req.query,
        page: req.query.page,
        limit: req.query.limit,
        userId: req.user._id,
        userRole: req.user.role,
      });

      res.status(200).json({
        success: true,
        data: result.sessions,
        pagination: {
          total: result.total,
          page: Number(req.query.page) || 1,
          limit: Number(req.query.limit) || 20,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async telemetry(req, res, next) {
    try {
      await sessionService.recordTelemetry(req.body);
      res.status(201).json({
        success: true,
        message: 'Telemetry point recorded',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const sessionController = new SessionController();
