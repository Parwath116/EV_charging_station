import { ObjectId } from 'mongodb';
import { getDb } from '../config/db.js';

export class AlertRepository {
  static getCollection() {
    return getDb().collection('alerts');
  }

  /**
   * Insert new operational alert.
   * MongoDB Operator: insertOne()
   */
  static async createAlert(alertData) {
    const doc = {
      stationId:
        alertData.stationId instanceof ObjectId
          ? alertData.stationId
          : new ObjectId(alertData.stationId),
      chargerId: alertData.chargerId,
      type: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      acknowledged: false,
      createdAt: alertData.createdAt || new Date(),
    };
    const result = await this.getCollection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
  }

  /**
   * Find alerts with filtering and pagination.
   * Leverages partial index `idx_alerts_unack_partial` when acknowledged: false.
   * MongoDB Operator: find(), sort(), skip(), limit()
   */
  static async findAlerts({ stationId, severity, type, acknowledged, limit = 20, skip = 0 } = {}) {
    const query = {};
    if (stationId) {
      query.stationId = stationId instanceof ObjectId ? stationId : new ObjectId(stationId);
    }
    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (typeof acknowledged === 'boolean') query.acknowledged = acknowledged;

    const [alerts, total] = await Promise.all([
      this.getCollection().find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      this.getCollection().countDocuments(query),
    ]);

    return { alerts, total, limit, skip };
  }

  /**
   * Find alert by ID.
   * MongoDB Operator: findOne()
   */
  static async findById(id) {
    const filter = { _id: id instanceof ObjectId ? id : new ObjectId(id) };
    return this.getCollection().findOne(filter);
  }

  /**
   * Count unacknowledged alerts (fast partial index scan).
   * MongoDB Operator: countDocuments()
   */
  static async countUnacknowledged() {
    return this.getCollection().countDocuments({ acknowledged: false });
  }

  /**
   * Acknowledge / resolve alert.
   * MongoDB Operator: findOneAndUpdate(), $set
   */
  static async acknowledgeAlert(id) {
    const filter = { _id: id instanceof ObjectId ? id : new ObjectId(id) };
    const update = {
      $set: {
        acknowledged: true,
        resolvedAt: new Date(),
      },
    };
    return this.getCollection().findOneAndUpdate(filter, update, {
      returnDocument: 'after',
    });
  }

  /**
   * Delete alerts older than specified date (used for cleanup or tests).
   * MongoDB Operator: deleteMany()
   */
  static async deleteOlderThan(cutoffDate) {
    return this.getCollection().deleteMany({ createdAt: { $lt: cutoffDate } });
  }
}
