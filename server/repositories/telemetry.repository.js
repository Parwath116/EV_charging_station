import { getDb } from '../config/db.js';

export class TelemetryRepository {
  static getCollection() {
    return getDb().collection('telemetry');
  }

  /**
   * Bulk insert telemetry sensor readings into time-series collection.
   * MongoDB Operator: insertMany()
   */
  static async insertMany(readings) {
    if (!readings || readings.length === 0) return { insertedCount: 0 };
    return this.getCollection().insertMany(readings);
  }

  /**
   * Insert single telemetry reading into time-series collection.
   * MongoDB Operator: insertOne()
   */
  static async insertOne(reading) {
    return this.getCollection().insertOne(reading);
  }

  /**
   * Query recent telemetry for a specific station/charger.
   * MongoDB Operator: find(), sort()
   */
  static async getRecentForCharger(stationId, chargerId, limit = 20) {
    return this.getCollection()
      .find({
        'meta.stationId': stationId,
        'meta.chargerId': chargerId,
      })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Query latest telemetry for all chargers of a station.
   * MongoDB Pipeline: $match, $sort, $group
   */
  static async getLatestForStation(stationId) {
    return this.getCollection()
      .aggregate([
        { $match: { 'meta.stationId': stationId } },
        { $sort: { ts: -1 } },
        {
          $group: {
            _id: '$meta.chargerId',
            latestReading: { $first: '$$ROOT' },
          },
        },
      ])
      .toArray();
  }
}
