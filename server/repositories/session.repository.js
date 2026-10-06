import { ObjectId } from 'mongodb';
import { getDB, getClient } from '../config/db.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class SessionRepository {
  get collection() {
    return getDB().collection('sessions');
  }

  /**
   * Starts a charging session inside an ACID Multi-Document Transaction
   * MongoDB operation: session.withTransaction() across stations and sessions
   */
  async startSession({ userId, stationId, chargerId }) {
    const client = getClient();
    const session = client.startSession();

    try {
      let createdSession;

      await session.withTransaction(async () => {
        const db = getDB();
        const userObjId = new ObjectId(userId);
        const stationObjId = new ObjectId(stationId);

        // 1. Verify user wallet balance
        const user = await db.collection('users').findOne({ _id: userObjId }, { session });
        if (!user) throw new NotFoundError('User not found');
        if (user.walletBalance < 50) {
          throw new BadRequestError(
            `Insufficient wallet balance (₹${user.walletBalance.toFixed(2)}). A minimum balance of ₹50 is required to initiate charging.`
          );
        }

        // 2. Atomically transition charger to 'charging'
        const chargerUpdate = await db.collection('stations').updateOne(
          {
            _id: stationObjId,
            'chargers.chargerId': chargerId,
            'chargers.status': { $in: ['available', 'reserved'] },
          },
          {
            $set: { 'chargers.$.status': 'charging' },
          },
          { session }
        );

        if (chargerUpdate.matchedCount === 0) {
          throw new BadRequestError(`Charger ${chargerId} is unavailable or currently in use`);
        }

        // 3. Create session record
        const sessionDoc = {
          userId: userObjId,
          stationId: stationObjId,
          chargerId,
          startedAt: new Date(),
          energyKWh: 0,
          cost: 0,
          paymentStatus: 'pending',
          createdAt: new Date(),
        };

        const result = await db.collection('sessions').insertOne(sessionDoc, { session });
        createdSession = { _id: result.insertedId, ...sessionDoc };
      });

      return createdSession;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Completes a charging session inside an ACID Multi-Document Transaction:
   * updates session, transitions charger to 'available', and debits user wallet via $inc
   * MongoDB operation: session.withTransaction() across stations, sessions, and users
   */
  async stopSession({ sessionId, userId, userRole, finalEnergyKWh }) {
    const client = getClient();
    const session = client.startSession();

    try {
      let completedSession;

      await session.withTransaction(async () => {
        const db = getDB();
        const sessionObjId = new ObjectId(sessionId);

        // 1. Fetch active session
        const sessionDoc = await db.collection('sessions').findOne(
          {
            _id: sessionObjId,
            endedAt: { $exists: false },
          },
          { session }
        );

        if (!sessionDoc) {
          throw new NotFoundError('Active charging session not found or already completed');
        }

        if (userRole === 'driver' && sessionDoc.userId.toString() !== userId.toString()) {
          throw new BadRequestError('You are not authorized to stop this session');
        }

        // 2. Get station tariff to compute total cost
        const station = await db
          .collection('stations')
          .findOne({ _id: sessionDoc.stationId }, { session });
        const tariff = station?.tariffPerKWh || 17.5;
        const energy = Number(Math.max(0.1, Number(finalEnergyKWh) || 12.5).toFixed(2));
        const totalCost = Number((energy * tariff).toFixed(2));

        // 3. Atomically debit user wallet balance without going below 0
        const user = await db.collection('users').findOne({ _id: sessionDoc.userId }, { session });
        const walletBalance = Number(user?.walletBalance) || 0;
        const amountDebited = Number(Math.min(totalCost, Math.max(0, walletBalance)).toFixed(2));
        const amountDue = Number(Math.max(0, totalCost - amountDebited).toFixed(2));
        const paymentStatus = amountDue > 0 ? 'due' : 'paid';

        if (amountDebited > 0) {
          await db
            .collection('users')
            .updateOne(
              { _id: sessionDoc.userId },
              { $inc: { walletBalance: -amountDebited } },
              { session }
            );
        }

        // 4. Atomically reset charger back to 'available'
        await db.collection('stations').updateOne(
          {
            _id: sessionDoc.stationId,
            'chargers.chargerId': sessionDoc.chargerId,
          },
          {
            $set: { 'chargers.$.status': 'available' },
          },
          { session }
        );

        // 5. Update session record
        const now = new Date();
        const updateResult = await db.collection('sessions').findOneAndUpdate(
          { _id: sessionObjId },
          {
            $set: {
              endedAt: now,
              energyKWh: energy,
              cost: totalCost,
              paymentStatus,
              amountDue,
            },
          },
          { session, returnDocument: 'after' }
        );

        completedSession = updateResult;
      });

      return completedSession;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Logs telemetry measurement into time-series collection
   * MongoDB operation: db.collection('telemetry').insertOne(...)
   */
  async logTelemetry(telemetryDoc) {
    return getDB()
      .collection('telemetry')
      .insertOne({
        ts: telemetryDoc.ts || telemetryDoc.timestamp || new Date(),
        meta: {
          stationId: new ObjectId(telemetryDoc.stationId),
          chargerId: telemetryDoc.chargerId,
          sessionId: telemetryDoc.sessionId ? new ObjectId(telemetryDoc.sessionId) : null,
        },
        powerKW: Number(telemetryDoc.powerKW) || 0,
        voltage: Number(telemetryDoc.voltage) || 400,
        currentA: Number(telemetryDoc.currentA) || 0,
        socPercent: Number(telemetryDoc.socPercent) || 0,
        temperatureC: Number(telemetryDoc.temperatureC) || 35,
      });
  }

  /**
   * Finds active session for a specific user
   */
  async getActiveSession(userId) {
    return this.collection.findOne({
      userId: new ObjectId(userId),
      endedAt: { $exists: false },
    });
  }

  /**
   * Finds sessions with station metadata joined via $lookup
   */
  async findSessions({ filter = {}, skip = 0, limit = 20, sort = { startedAt: -1 } } = {}) {
    const matchQuery = {};

    if (filter.userId) {
      matchQuery.userId = new ObjectId(filter.userId);
    }
    if (filter.stationId) {
      matchQuery.stationId = new ObjectId(filter.stationId);
    }
    if (filter.paymentStatus) {
      matchQuery.paymentStatus = filter.paymentStatus;
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'stations',
          localField: 'stationId',
          foreignField: '_id',
          as: 'station',
        },
      },
      {
        $unwind: {
          path: '$station',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          userId: 1,
          stationId: 1,
          chargerId: 1,
          startedAt: 1,
          endedAt: 1,
          energyKWh: 1,
          cost: 1,
          paymentStatus: 1,
          createdAt: 1,
          stationName: '$station.name',
          stationAddress: '$station.address',
          stationArea: '$station.area',
          tariffPerKWh: '$station.tariffPerKWh',
        },
      },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ];

    const [sessions, total] = await Promise.all([
      this.collection.aggregate(pipeline).toArray(),
      this.collection.countDocuments(matchQuery),
    ]);

    return { sessions, total };
  }

  async findById(id) {
    if (!ObjectId.isValid(id)) return null;
    return this.collection.findOne({ _id: new ObjectId(id) });
  }
}

export const sessionRepository = new SessionRepository();
