import { ObjectId } from 'mongodb';
import { AlertRepository } from '../repositories/alert.repository.js';
import { StationRepository } from '../repositories/station.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { SSEService } from './sse.service.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class AlertService {
  /**
   * Evaluates telemetry sensor reading against operational thresholds.
   * Creates alerts in the `alerts` collection and triggers hardware safety lockouts.
   */
  static async evaluateTelemetry(reading) {
    const { stationId, chargerId, powerKW, voltage, temperatureC, faultCode } = reading;
    let anomaly = null;

    if (temperatureC >= 75) {
      anomaly = {
        type: 'overtemperature',
        severity: 'critical',
        message: `Critical thermal cutoff: Charger ${chargerId} reached ${temperatureC}°C.`,
      };
    } else if (temperatureC >= 65) {
      anomaly = {
        type: 'overtemperature',
        severity: 'high',
        message: `High operating temperature: Charger ${chargerId} at ${temperatureC}°C.`,
      };
    } else if (voltage && (voltage > 260 || voltage < 190)) {
      anomaly = {
        type: 'overvoltage',
        severity: 'high',
        message: `Grid voltage deviation: ${voltage}V detected on charger ${chargerId}.`,
      };
    } else if (faultCode) {
      anomaly = {
        type: 'fault_code',
        severity: 'critical',
        message: `Hardware safety fault code [${faultCode}] reported on charger ${chargerId}.`,
      };
    } else if (powerKW && powerKW > 180) {
      anomaly = {
        type: 'power_surge',
        severity: 'high',
        message: `Power surge detected: ${powerKW}kW output on charger ${chargerId}.`,
      };
    }

    if (!anomaly) return null;

    const alertDoc = await AlertRepository.createAlert({
      stationId,
      chargerId,
      type: anomaly.type,
      severity: anomaly.severity,
      message: anomaly.message,
    });

    logger.warn(
      `Hardware Anomaly Alert created: [${anomaly.severity.toUpperCase()}] ${anomaly.message}`
    );

    // If critical severity, update charger hardware status to 'faulted'
    if (anomaly.severity === 'critical') {
      try {
        await StationRepository.updateChargerStatus(stationId, chargerId, 'faulted');
        logger.info(`Charger ${chargerId} automatically transitioned to 'faulted' status.`);
      } catch (err) {
        logger.error(`Failed to transition charger ${chargerId} status on anomaly: ${err.message}`);
      }
    }

    // Direct SSE broadcast for immediate client push
    SSEService.broadcast('alert', alertDoc);

    return alertDoc;
  }

  /**
   * List alerts with filtering and pagination.
   */
  static async listAlerts(filters) {
    return AlertRepository.findAlerts(filters);
  }

  /**
   * Retrieve total unacknowledged alerts count.
   */
  static async getUnreadCount() {
    return AlertRepository.countUnacknowledged();
  }

  /**
   * Resolve / acknowledge an alert.
   * MongoDB Operator: findOneAndUpdate()
   */
  static async resolveAlert(alertId, actorId, ip) {
    const existing = await AlertRepository.findById(alertId);
    if (!existing) {
      throw new NotFoundError(`Alert ${alertId} not found.`);
    }

    const updated = await AlertRepository.acknowledgeAlert(alertId);

    // Audit log
    await AuditRepository.log({
      actorId: actorId ? new ObjectId(actorId) : 'system',
      action: 'ALERT_RESOLVED',
      collection: 'alerts',
      documentId: new ObjectId(alertId),
      before: { acknowledged: false },
      after: { acknowledged: true, resolvedAt: updated.resolvedAt },
      ip: ip || '127.0.0.1',
    });

    SSEService.broadcast('alert_resolved', {
      alertId,
      resolvedAt: updated.resolvedAt,
    });

    return updated;
  }
}
