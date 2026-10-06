import { sessionRepository } from '../repositories/session.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';

export class SessionService {
  async startSession({ stationId, chargerId }, userId, ip) {
    const session = await sessionRepository.startSession({
      userId,
      stationId,
      chargerId,
    });

    auditRepository.createLog({
      actorId: userId,
      action: 'START_CHARGING_SESSION',
      collection: 'sessions',
      documentId: session._id,
      after: session,
      ip,
    });

    return session;
  }

  async stopSession({ sessionId, finalEnergyKWh }, userId, userRole, ip) {
    const session = await sessionRepository.stopSession({
      sessionId,
      userId,
      userRole,
      finalEnergyKWh,
    });

    auditRepository.createLog({
      actorId: userId,
      action: 'STOP_CHARGING_SESSION',
      collection: 'sessions',
      documentId: session._id,
      after: session,
      ip,
    });

    return session;
  }

  async getActiveSession(userId) {
    return sessionRepository.getActiveSession(userId);
  }

  async getSessions({ filter = {}, page = 1, limit = 20, userId, userRole }) {
    const effectiveFilter = { ...filter };
    if (userRole === 'driver') {
      effectiveFilter.userId = userId;
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    return sessionRepository.findSessions({
      filter: effectiveFilter,
      skip,
      limit: Math.max(1, Number(limit)),
    });
  }

  async recordTelemetry(data) {
    return sessionRepository.logTelemetry(data);
  }
}

export const sessionService = new SessionService();
