import { ObjectId } from 'mongodb';
import { getDB, getClient } from '../config/db.js';
import { ConflictError, NotFoundError, BadRequestError } from '../utils/errors.js';

export class BookingRepository {
  get collection() {
    return getDB().collection('bookings');
  }

  /**
   * Creates a booking with concurrency conflict checking inside an ACID Multi-Document Transaction
   * MongoDB operation: session.withTransaction() across bookings collection
   */
  async createBookingWithConflictCheck({
    userId,
    stationId,
    chargerId,
    startTime,
    endTime,
    estimatedCost = 0,
  }) {
    const client = getClient();
    const session = client.startSession();

    try {
      let createdBooking;

      await session.withTransaction(async () => {
        const db = getDB();
        const start = new Date(startTime);
        const end = new Date(endTime);
        const stationObjId = new ObjectId(stationId);
        const userObjId = new ObjectId(userId);

        if (end <= start) {
          throw new BadRequestError('Booking end time must be after start time');
        }

        // 1. Atomically increment bookingVersion on target charger to lock document and prevent write skew
        const lockUpdate = await db
          .collection('stations')
          .updateOne(
            { _id: stationObjId, 'chargers.chargerId': chargerId },
            { $inc: { 'chargers.$.bookingVersion': 1 } },
            { session }
          );
        if (lockUpdate.matchedCount === 0) {
          throw new NotFoundError(`Charger ${chargerId} does not exist at this station`);
        }

        // Verify Station & Charger existence and status
        const station = await db.collection('stations').findOne({ _id: stationObjId }, { session });
        if (!station) {
          throw new NotFoundError('Target charging station not found');
        }

        const charger = (station.chargers || []).find(c => c.chargerId === chargerId);
        if (!charger) {
          throw new NotFoundError(`Charger ${chargerId} does not exist at this station`);
        }
        if (charger.status === 'faulted' || charger.status === 'maintenance') {
          throw new BadRequestError(`Charger ${chargerId} is currently out of service`);
        }

        // 2. Check for overlapping reservations
        // Overlap condition: (slot.start < req.end) AND (slot.end > req.start)
        const conflict = await db.collection('bookings').findOne(
          {
            stationId: stationObjId,
            chargerId,
            status: { $in: ['pending', 'confirmed'] },
            startTime: { $lt: end },
            endTime: { $gt: start },
          },
          { session }
        );

        if (conflict) {
          throw new ConflictError(
            `Charger slot ${chargerId} is already reserved for the selected window (${conflict.startTime.toISOString()} - ${conflict.endTime.toISOString()})`
          );
        }

        // 3. Insert reservation document
        const bookingDoc = {
          userId: userObjId,
          stationId: stationObjId,
          chargerId,
          startTime: start,
          endTime: end,
          status: 'confirmed',
          estimatedCost: Number(estimatedCost) || 0,
          createdAt: new Date(),
        };

        const insertResult = await db.collection('bookings').insertOne(bookingDoc, { session });
        createdBooking = { _id: insertResult.insertedId, ...bookingDoc };
      });

      return createdBooking;
    } catch (error) {
      if (
        error.hasErrorLabel?.('TransientTransactionError') ||
        error.code === 112 ||
        error.codeName === 'WriteConflict' ||
        error.message?.includes('WriteConflict')
      ) {
        throw new ConflictError(
          `Charger slot ${chargerId} is undergoing concurrent reservation. Conflict detected.`
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reschedules an existing booking inside an ACID transaction with overlap validation
   * MongoDB operation: session.withTransaction()
   */
  async rescheduleBooking(id, { userId, userRole, newStartTime, newEndTime }) {
    const client = getClient();
    const session = client.startSession();

    try {
      let updatedBooking;

      await session.withTransaction(async () => {
        const db = getDB();
        const bookingId = new ObjectId(id);
        const start = new Date(newStartTime);
        const end = new Date(newEndTime);

        if (end <= start) {
          throw new BadRequestError('New end time must be after new start time');
        }

        // 1. Find existing booking
        const booking = await db.collection('bookings').findOne({ _id: bookingId }, { session });
        if (!booking) {
          throw new NotFoundError('Booking not found');
        }

        if (userRole === 'driver' && booking.userId.toString() !== userId.toString()) {
          throw new BadRequestError('You are not authorized to modify this booking');
        }

        if (booking.status === 'cancelled' || booking.status === 'completed') {
          throw new BadRequestError(`Cannot reschedule a ${booking.status} booking`);
        }

        // 2. Check for conflicts excluding current booking
        const conflict = await db.collection('bookings').findOne(
          {
            _id: { $ne: bookingId },
            stationId: booking.stationId,
            chargerId: booking.chargerId,
            status: { $in: ['pending', 'confirmed'] },
            startTime: { $lt: end },
            endTime: { $gt: start },
          },
          { session }
        );

        if (conflict) {
          throw new ConflictError(
            `Reschedule conflict: Charger ${booking.chargerId} is already booked for that new time`
          );
        }

        // Atomically increment bookingVersion on target charger to lock document
        await db
          .collection('stations')
          .updateOne(
            { _id: booking.stationId, 'chargers.chargerId': booking.chargerId },
            { $inc: { 'chargers.$.bookingVersion': 1 } },
            { session }
          );

        // 3. Apply reschedule
        const updateResult = await db.collection('bookings').findOneAndUpdate(
          { _id: bookingId },
          {
            $set: {
              startTime: start,
              endTime: end,
              rescheduledAt: new Date(),
            },
          },
          { session, returnDocument: 'after' }
        );

        updatedBooking = updateResult;
      });

      return updatedBooking;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Cancels a booking using atomic findOneAndUpdate
   * MongoDB operation: db.collection('bookings').findOneAndUpdate({ _id }, { $set: { status: 'cancelled' } }, { returnDocument: 'after' })
   */
  async cancelBooking(id, userId, userRole) {
    const query = {
      _id: new ObjectId(id),
      status: { $in: ['pending', 'confirmed'] },
    };

    if (userRole === 'driver') {
      query.userId = new ObjectId(userId);
    }

    const result = await this.collection.findOneAndUpdate(
      query,
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new BadRequestError('Active reservation not found or already cancelled');
    }

    return result;
  }

  /**
   * Retrieves bookings with station metadata populated via aggregation $lookup
   * MongoDB operation: db.collection('bookings').aggregate([ { $match }, { $lookup }, { $sort }, { $skip }, { $limit } ])
   */
  async findBookings({ filter = {}, skip = 0, limit = 20, sort = { startTime: -1 } } = {}) {
    const matchQuery = {};

    if (filter.userId) {
      matchQuery.userId = new ObjectId(filter.userId);
    }
    if (filter.stationId) {
      matchQuery.stationId = new ObjectId(filter.stationId);
    }
    if (filter.status) {
      matchQuery.status = filter.status;
    }
    if (filter.chargerId) {
      matchQuery.chargerId = filter.chargerId;
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
          startTime: 1,
          endTime: 1,
          status: 1,
          estimatedCost: 1,
          createdAt: 1,
          rescheduledAt: 1,
          cancelledAt: 1,
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

    const [bookings, total] = await Promise.all([
      this.collection.aggregate(pipeline).toArray(),
      this.collection.countDocuments(matchQuery),
    ]);

    return { bookings, total };
  }

  /**
   * Finds a booking by ObjectId
   */
  async findById(id) {
    if (!ObjectId.isValid(id)) return null;
    return this.collection.findOne({ _id: new ObjectId(id) });
  }
}

export const bookingRepository = new BookingRepository();
