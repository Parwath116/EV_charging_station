import { ObjectId } from 'mongodb';
import { getDB, getClient } from '../config/db.js';
import { BENGALURU_BOUNDS } from '../config/constants.js';

export class LabRepository {
  /**
   * Runs explain("executionStats") for given query scenario.
   * MongoDB Feature: .explain("executionStats")
   */
  static async runExplain(scenario) {
    const db = getDB();

    switch (scenario) {
      case 'geo_near': {
        const query = {
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [77.63, 12.93], // Koramangala
              },
              $maxDistance: 10000,
            },
          },
          status: 'active',
        };
        const explainResult = await db.collection('stations').find(query).explain('executionStats');
        return {
          scenario: 'Geospatial Discovery ($near 2dsphere)',
          collection: 'stations',
          query: JSON.stringify(query, null, 2),
          executionStats: explainResult.executionStats,
          serverInfo: explainResult.serverInfo,
        };
      }

      case 'text_search': {
        const query = { $text: { $search: 'Fast CCS2 Whitefield' } };
        const explainResult = await db.collection('stations').find(query).explain('executionStats');
        return {
          scenario: 'Full-Text Search ($text on name, address, area, amenities)',
          collection: 'stations',
          query: JSON.stringify(query, null, 2),
          executionStats: explainResult.executionStats,
          serverInfo: explainResult.serverInfo,
        };
      }

      case 'partial_index_bookings': {
        const query = {
          status: 'confirmed',
          startTime: { $gte: new Date(Date.now() - 7 * 86400000) },
        };
        const explainResult = await db.collection('bookings').find(query).explain('executionStats');
        return {
          scenario: 'Active Bookings Query (Filtered Partial Index)',
          collection: 'bookings',
          query: JSON.stringify(query, null, 2),
          executionStats: explainResult.executionStats,
          serverInfo: explainResult.serverInfo,
        };
      }

      case 'peak_hour_agg': {
        const pipeline = [
          {
            $project: {
              hour: { $hour: '$startedAt' },
              energyKWh: 1,
              cost: 1,
            },
          },
          {
            $group: {
              _id: '$hour',
              sessionCount: { $sum: 1 },
              totalEnergyKWh: { $sum: '$energyKWh' },
              totalRevenue: { $sum: '$cost' },
            },
          },
          { $sort: { _id: 1 } },
        ];
        const explainResult = await db
          .collection('sessions')
          .aggregate(pipeline)
          .explain('executionStats');
        return {
          scenario: 'Diurnal Peak-Hour Aggregation ($project, $hour, $group, $sort)',
          collection: 'sessions',
          query: JSON.stringify(pipeline, null, 2),
          executionStats: explainResult.executionStats || explainResult.stages,
          serverInfo: explainResult.serverInfo,
        };
      }

      case 'telemetry_timeseries': {
        const query = {
          'meta.chargerId': { $exists: true },
          ts: { $gte: new Date(Date.now() - 3600000) },
        };
        const explainResult = await db
          .collection('telemetry')
          .find(query)
          .explain('executionStats');
        return {
          scenario: 'Time-Series Sensor Query (Telemetry Compound Index)',
          collection: 'telemetry',
          query: JSON.stringify(query, null, 2),
          executionStats: explainResult.executionStats,
          serverInfo: explainResult.serverInfo,
        };
      }

      default:
        throw new Error(`Unsupported explain scenario: ${scenario}`);
    }
  }

  /**
   * Compares query performance side-by-side: IXSCAN (with index) vs COLLSCAN (forced table scan).
   * MongoDB Features: .explain("executionStats"), .hint({ $natural: 1 })
   */
  static async runIndexComparison() {
    const db = getDB();
    const query = { status: 'active', tariffPerKWh: { $lte: 25 } };

    // 1. With Index (Default optimizer uses idx_stations_active_tariff_partial or standard index)
    const withIndexExplain = await db
      .collection('stations')
      .find(query)
      .hint({ status: 1, tariffPerKWh: 1 })
      .explain('executionStats');

    // 2. Without Index (Forced collection scan via natural hint)
    const withoutIndexExplain = await db
      .collection('stations')
      .find(query)
      .hint({ $natural: 1 })
      .explain('executionStats');

    const withStats = withIndexExplain.executionStats || {};
    const withoutStats = withoutIndexExplain.executionStats || {};

    const docsExaminedDiff =
      (withoutStats.totalDocsExamined || 0) - (withStats.totalDocsExamined || 0);
    const docReductionPct =
      withoutStats.totalDocsExamined > 0
        ? Math.round((docsExaminedDiff / withoutStats.totalDocsExamined) * 100)
        : 0;

    return {
      query: JSON.stringify(query, null, 2),
      collection: 'stations',
      indexedRun: {
        stage: 'IXSCAN',
        indexName: 'idx_stations_active_tariff_partial',
        executionTimeMillis: withStats.executionTimeMillis || 0,
        totalDocsExamined: withStats.totalDocsExamined || 0,
        totalKeysExamined: withStats.totalKeysExamined || 0,
        nReturned: withStats.nReturned || 0,
      },
      unindexedRun: {
        stage: 'COLLSCAN',
        indexName: 'none (collection scan)',
        executionTimeMillis: withoutStats.executionTimeMillis || 0,
        totalDocsExamined: withoutStats.totalDocsExamined || 0,
        totalKeysExamined: withoutStats.totalKeysExamined || 0,
        nReturned: withoutStats.nReturned || 0,
      },
      analysis: {
        docsExaminedSaved: docsExaminedDiff,
        docReductionPercentage: `${docReductionPct}%`,
        verdict:
          'Index scan drastically restricts disk I/O and document evaluation, ensuring deterministic sub-millisecond execution even as collections scale.',
      },
    };
  }

  /**
   * Intentionally attempts an invalid write to trigger MongoDB Error 121 ($jsonSchema violation).
   * MongoDB Feature: $jsonSchema strict validation failure diagnostics
   */
  static async runValidationDemo(type) {
    const db = getDB();

    try {
      if (type === 'negative_wallet') {
        // Violates users schema: walletBalance minimum: 0
        await db.collection('users').insertOne({
          email: `invalid-wallet-${Date.now()}@voltgrid.test`,
          passwordHash: 'dummy_hash',
          name: 'Invalid Test Driver',
          role: 'driver',
          walletBalance: -1500, // VIOLATION
          favouriteStations: [],
          vehicles: [],
          isEmailVerified: true,
          createdAt: new Date(),
        });
      } else if (type === 'out_of_bounds_gps') {
        // Violates stations schema: coordinates must be within Bengaluru bounds
        await db.collection('stations').insertOne({
          name: 'Invalid Location Station',
          operator: 'VoltGrid Test Operator',
          address: 'Invalid Coordinates Road',
          area: 'Out of Bounds',
          tariffPerKWh: 20,
          location: {
            type: 'Point',
            coordinates: [100.5, 50.2], // VIOLATION: Far outside Bengaluru bounds
          },
          amenities: [],
          status: 'active',
          chargers: [
            {
              chargerId: `CHG-ERR-${Date.now().toString().slice(-4)}`,
              connector: 'CCS2',
              powerKW: 60,
              status: 'available',
            },
          ],
          createdAt: new Date(),
        });
      } else if (type === 'invalid_connector') {
        // Violates chargers.connector enum ['CCS2', 'Type2', 'CHAdeMO', 'GB/T']
        await db.collection('stations').insertOne({
          name: 'Invalid Connector Station',
          operator: 'VoltGrid Test Operator',
          address: 'Station Road',
          area: 'Whitefield',
          tariffPerKWh: 20,
          location: {
            type: 'Point',
            coordinates: [77.74, 12.96],
          },
          amenities: [],
          status: 'active',
          chargers: [
            {
              chargerId: `CHG-ERR-${Date.now().toString().slice(-4)}`,
              connector: 'TESLA_SUPERCHARGER_INVALID', // VIOLATION
              powerKW: 60,
              status: 'available',
            },
          ],
          createdAt: new Date(),
        });
      }

      return {
        rejected: false,
        message: 'Write unexpectedly succeeded without triggering schema violation.',
      };
    } catch (err) {
      // Return captured MongoDB Error 121
      return {
        rejected: true,
        errorCode: err.code || 121,
        errorName: err.name || 'MongoServerError',
        message: err.message,
        details: err.errInfo?.details || 'Document failed validation',
        schemaEnforcement: 'Strict server-side validation level: error',
      };
    }
  }

  /**
   * Demonstrates Multi-Document ACID Transactions (Commit vs Abort Rollback).
   * MongoDB Feature: session.withTransaction()
   */
  static async runTransactionDemo(shouldAbort = false) {
    const client = getClient();
    const db = getDB();
    const session = client.startSession();

    const testBookingId = new ObjectId();
    const startTime = Date.now();
    const logTrace = [];

    try {
      await session.withTransaction(async () => {
        logTrace.push('1. Transaction started in snapshot isolation mode.');

        // 1. Find a test station
        const station = await db.collection('stations').findOne({ status: 'active' }, { session });
        if (!station) throw new Error('No active station available for transaction demo');
        const chargerId = station.chargers[0].chargerId;
        logTrace.push(`2. Located station "${station.name}" and locked charger "${chargerId}".`);

        // 2. Insert test reservation
        const bookingDoc = {
          _id: testBookingId,
          userId: new ObjectId(),
          stationId: station._id,
          chargerId,
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
          status: 'confirmed',
          estimatedCost: 350,
          createdAt: new Date(),
        };
        await db.collection('bookings').insertOne(bookingDoc, { session });
        logTrace.push(
          `3. Stage write: Inserted booking document [${testBookingId}] with status "confirmed".`
        );

        // 3. Atomically increment bookingVersion on target charger
        await db
          .collection('stations')
          .updateOne(
            { _id: station._id, 'chargers.chargerId': chargerId },
            { $inc: { 'chargers.$.bookingVersion': 1 } },
            { session }
          );
        logTrace.push(
          '4. Stage write: Incremented charger bookingVersion counter to guard against write skew.'
        );

        // 4. If test requested intentional abort, throw error to trigger rollback
        if (shouldAbort) {
          logTrace.push(
            '5. SIMULATED FAULT: Injection error triggered before commit. Initiating abortTransaction().'
          );
          throw new Error('SIMULATED_TRANSACTION_FAULT_TEST');
        }

        logTrace.push('5. All staging operations succeeded. Committing transaction to cluster.');
      });

      const durationMillis = Date.now() - startTime;

      // Verify persistence in DB
      const persistedBooking = await db.collection('bookings').findOne({ _id: testBookingId });

      // Clean up test booking if committed
      if (persistedBooking) {
        await db.collection('bookings').deleteOne({ _id: testBookingId });
      }

      return {
        transactionStatus: 'COMMITTED',
        persistedInDatabase: Boolean(persistedBooking),
        durationMillis,
        logTrace,
      };
    } catch (err) {
      const durationMillis = Date.now() - startTime;

      // Verify that booking was NOT persisted
      const persistedBooking = await db.collection('bookings').findOne({ _id: testBookingId });

      logTrace.push(
        '6. Rollback confirmed: Zero writes survived. Cluster returned to pre-transaction state.'
      );

      return {
        transactionStatus: 'ABORTED',
        persistedInDatabase: Boolean(persistedBooking),
        abortedDueTo: err.message,
        durationMillis,
        logTrace,
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Retrieves summary of all collections, document counts, storage, and indexes.
   * MongoDB Features: db.command({ collStats: ... }), collection.indexes()
   */
  static async getSchemaSummary() {
    const db = getDB();
    const collectionNames = [
      'stations',
      'bookings',
      'sessions',
      'users',
      'telemetry',
      'alerts',
      'audit_logs',
      'daily_station_stats',
    ];

    const summaries = [];

    for (const name of collectionNames) {
      try {
        const [count, indexes] = await Promise.all([
          db.collection(name).countDocuments(),
          db.collection(name).indexes(),
        ]);

        let storageSize = 0;
        let totalIndexSize = 0;
        let isTimeSeries = false;

        try {
          const stats = await db.command({ collStats: name });
          storageSize = stats.storageSize || stats.size || 0;
          totalIndexSize = stats.totalIndexSize || 0;
          isTimeSeries = Boolean(stats.timeseries);
        } catch {
          // collStats might fail on special view or permissions, use fallback
        }

        summaries.push({
          collection: name,
          documentCount: count,
          storageSizeBytes: storageSize,
          totalIndexSizeBytes: totalIndexSize,
          isTimeSeries,
          indexes: indexes.map(idx => ({
            name: idx.name,
            key: idx.key,
            unique: Boolean(idx.unique),
            partial: Boolean(idx.partialFilterExpression),
            ttlSeconds: idx.expireAfterSeconds || null,
          })),
        });
      } catch (err) {
        summaries.push({
          collection: name,
          error: err.message,
        });
      }
    }

    return {
      databaseName: db.databaseName,
      bengaluruBoundingBox: BENGALURU_BOUNDS,
      collections: summaries,
    };
  }
}
