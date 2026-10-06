import { ObjectId } from 'mongodb';
import { getDB, getClient } from '../config/db.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class StationRepository {
  get collection() {
    return getDB().collection('stations');
  }

  static async updateChargerStatus(stationId, chargerId, status) {
    return stationRepository.updateCharger(stationId, chargerId, { status });
  }

  static async updateCharger(stationId, chargerId, updateDoc) {
    return stationRepository.updateCharger(stationId, chargerId, updateDoc);
  }

  /**
   * Inserts a single station document
   * MongoDB operation: db.collection('stations').insertOne(stationDoc)
   */
  async create(stationDoc) {
    const doc = {
      ...stationDoc,
      createdAt: stationDoc.createdAt || new Date(),
    };
    const result = await this.collection.insertOne(doc);
    return this.findById(result.insertedId);
  }

  /**
   * Inserts multiple stations in bulk (CSV bulk import)
   * MongoDB operation: db.collection('stations').insertMany(stationDocs, { ordered: false })
   */
  async createMany(stationDocs) {
    const docs = stationDocs.map(s => ({
      ...s,
      createdAt: s.createdAt || new Date(),
    }));
    const result = await this.collection.insertMany(docs, { ordered: false });
    return result;
  }

  /**
   * Retrieves station by ObjectId
   * MongoDB operation: db.collection('stations').findOne({ _id: new ObjectId(id) })
   */
  async findById(id) {
    if (!ObjectId.isValid(id)) return null;
    return this.collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Lists stations with flexible filters, sorting, and pagination
   * MongoDB operation: db.collection('stations').find(query).sort().skip().limit().toArray()
   */
  async findStations({ filter = {}, sort = { createdAt: -1 }, skip = 0, limit = 20 } = {}) {
    const query = {};

    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.area) {
      query.area = filter.area;
    }
    if (filter.connector) {
      query['chargers.connector'] = filter.connector;
    }
    if (filter.minPowerKW) {
      query['chargers.powerKW'] = { $gte: Number(filter.minPowerKW) };
    }

    const [stations, total] = await Promise.all([
      this.collection.find(query).sort(sort).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query),
    ]);

    return { stations, total };
  }

  /**
   * Full-text search across station name, address, area, and amenities
   * MongoDB operation: db.collection('stations').find({ $text: { $search: text } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } })
   */
  async searchByText(searchText, { filter = {}, skip = 0, limit = 20 } = {}) {
    const query = {
      $text: { $search: searchText },
      ...filter,
    };

    const [stations, total] = await Promise.all([
      this.collection
        .find(query, { projection: { score: { $meta: 'textScore' } } })
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(query),
    ]);

    return { stations, total };
  }

  /**
   * Finds nearest stations via $geoNear aggregation pipeline on 2dsphere index
   * MongoDB operation: db.collection('stations').aggregate([ { $geoNear: { near: Point, distanceField: 'distanceMeters', spherical: true } } ])
   */
  async findNearest({ coordinates, maxDistance = 15000, limit = 10, onlyAvailable = false }) {
    const pipeline = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates,
          },
          distanceField: 'distanceMeters',
          maxDistance: Number(maxDistance),
          spherical: true,
          query: {
            status: 'active',
            ...(onlyAvailable ? { 'chargers.status': 'available' } : {}),
          },
        },
      },
      { $limit: Number(limit) },
    ];

    return this.collection.aggregate(pipeline).toArray();
  }

  /**
   * Finds stations within a circular area using $geoWithin and $centerSphere
   * MongoDB operation: db.collection('stations').find({ location: { $geoWithin: { $centerSphere: [ [lng, lat], radians ] } } })
   */
  async findWithinCircle({ centerLng, centerLat, radiusMeters }) {
    // Earth radius roughly 6378100 meters
    const radiusRadians = radiusMeters / 6378100;

    return this.collection
      .find({
        location: {
          $geoWithin: {
            $centerSphere: [[centerLng, centerLat], radiusRadians],
          },
        },
      })
      .toArray();
  }

  /**
   * Finds stations enclosed inside a custom polygon boundary
   * MongoDB operation: db.collection('stations').find({ location: { $geoWithin: { $geometry: { type: 'Polygon', coordinates } } } })
   */
  async findWithinPolygon(polygonCoordinates) {
    return this.collection
      .find({
        location: {
          $geoWithin: {
            $geometry: {
              type: 'Polygon',
              coordinates: polygonCoordinates,
            },
          },
        },
      })
      .toArray();
  }

  /**
   * Updates station details
   * MongoDB operation: db.collection('stations').updateOne({ _id }, { $set: updateDoc })
   */
  async update(id, updateDoc) {
    return this.collection.updateOne({ _id: new ObjectId(id) }, { $set: updateDoc });
  }

  /**
   * Toggles station lifecycle status
   * MongoDB operation: db.collection('stations').updateOne({ _id }, { $set: { status } })
   */
  async updateStatus(id, status) {
    return this.collection.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
  }

  /**
   * Updates station tariff per kWh
   * MongoDB operation: db.collection('stations').updateOne({ _id }, { $set: { tariffPerKWh } })
   */
  async updateTariff(id, tariffPerKWh) {
    return this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { tariffPerKWh: Number(tariffPerKWh) } }
    );
  }

  /**
   * Soft delete (sets status to 'decommissioned')
   * MongoDB operation: db.collection('stations').updateOne({ _id }, { $set: { status: 'decommissioned' } })
   */
  async softDelete(id) {
    return this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'decommissioned' } }
    );
  }

  /**
   * Hard delete with cascade check executed inside an ACID Multi-Document Transaction
   * MongoDB operation: session.withTransaction() across stations, bookings, and alerts
   */
  async hardDeleteWithCascadeCheck(id) {
    const client = getClient();
    const session = client.startSession();

    try {
      let deletionResult;

      await session.withTransaction(async () => {
        const stationObjId = new ObjectId(id);
        const db = getDB();

        // 1. Verify station exists
        const station = await db.collection('stations').findOne({ _id: stationObjId }, { session });
        if (!station) {
          throw new NotFoundError('Station not found');
        }

        // 2. Cascade Check: Block if active bookings exist
        const activeBookingsCount = await db.collection('bookings').countDocuments(
          {
            stationId: stationObjId,
            status: { $in: ['pending', 'confirmed'] },
          },
          { session }
        );

        if (activeBookingsCount > 0) {
          throw new BadRequestError(
            `Cannot hard delete station: ${activeBookingsCount} active reservation(s) exist. Decommission station instead.`
          );
        }

        // 3. Purge associated past bookings and alerts within the transaction
        await db.collection('bookings').deleteMany({ stationId: stationObjId }, { session });
        await db.collection('alerts').deleteMany({ stationId: stationObjId }, { session });

        // 4. Delete the station document
        deletionResult = await db
          .collection('stations')
          .deleteOne({ _id: stationObjId }, { session });
      });

      return deletionResult;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Appends an embedded charger document to a station
   * MongoDB operation: db.collection('stations').updateOne({ _id }, { $push: { chargers: chargerDoc } })
   */
  async addCharger(stationId, chargerDoc) {
    return this.collection.updateOne(
      { _id: new ObjectId(stationId) },
      { $push: { chargers: chargerDoc } }
    );
  }

  /**
   * Removes an embedded charger from a station by its chargerId
   * MongoDB operation: db.collection('stations').updateOne({ _id }, { $pull: { chargers: { chargerId } } })
   */
  async removeCharger(stationId, chargerId) {
    return this.collection.updateOne(
      { _id: new ObjectId(stationId) },
      { $pull: { chargers: { chargerId } } }
    );
  }

  /**
   * Updates an embedded charger using arrayFilters
   * MongoDB operation: db.collection('stations').updateOne({ _id }, { $set: { 'chargers.$[c].status': ... } }, { arrayFilters: [...] })
   */
  async updateCharger(stationId, chargerId, updateDoc) {
    const setPayload = {};
    for (const [key, value] of Object.entries(updateDoc)) {
      setPayload[`chargers.$[c].${key}`] = value;
    }

    return this.collection.updateOne(
      { _id: new ObjectId(stationId) },
      { $set: setPayload },
      { arrayFilters: [{ 'c.chargerId': chargerId }] }
    );
  }

  /**
   * Bulk synchronizes multiple charger statuses using bulkWrite
   * MongoDB operation: db.collection('stations').bulkWrite([ { updateOne: { ... } }, ... ])
   */
  async bulkSyncChargerStatuses(stationId, updates) {
    const operations = updates.map(u => ({
      updateOne: {
        filter: {
          _id: new ObjectId(stationId),
          'chargers.chargerId': u.chargerId,
        },
        update: {
          $set: { 'chargers.$.status': u.status },
        },
      },
    }));

    return this.collection.bulkWrite(operations, { ordered: false });
  }
}

export const stationRepository = new StationRepository();
