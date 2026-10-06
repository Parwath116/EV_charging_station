import { stationRepository } from '../repositories/station.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { BENGALURU_BOUNDS } from '../config/constants.js';

export class StationService {
  async createStation(stationData, actorId, ip) {
    const station = await stationRepository.create(stationData);

    // Audit log
    auditRepository.createLog({
      actorId,
      action: 'CREATE_STATION',
      collection: 'stations',
      documentId: station._id,
      after: station,
      ip,
    });

    return station;
  }

  /**
   * Parses CSV content and batch-imports stations
   */
  async importStationsFromCSV(csvString, actorId, ip) {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) {
      throw new BadRequestError('CSV file is empty or missing headers');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const stations = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });

      const lng = parseFloat(row.lng || row.longitude);
      const lat = parseFloat(row.lat || row.latitude);

      if (
        isNaN(lng) ||
        isNaN(lat) ||
        lng < BENGALURU_BOUNDS.minLng ||
        lng > BENGALURU_BOUNDS.maxLng ||
        lat < BENGALURU_BOUNDS.minLat ||
        lat > BENGALURU_BOUNDS.maxLat
      ) {
        throw new BadRequestError(
          `Row ${i}: Coordinates [${lng}, ${lat}] are outside Bengaluru bounds`
        );
      }

      const powerKW = parseInt(row.powerKW || '60', 10);
      const chargerId = row.chargerId || `CHG-CSV-${Date.now()}-${i}`;

      stations.push({
        name: row.name,
        operator: row.operator || 'VoltGrid Bulk Distribution',
        address: row.address || `${row.area || 'Central'}, Bengaluru`,
        area: row.area || 'Whitefield',
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        amenities: row.amenities ? row.amenities.split(';') : ['WiFi', '24/7 Security'],
        tariffPerKWh: parseFloat(row.tariff || row.tariffPerKWh || '18.0'),
        openHours: row.openHours || '24/7',
        status: row.status || 'active',
        chargers: [
          {
            chargerId,
            connector: row.connector || 'CCS2',
            powerKW,
            status: 'available',
          },
        ],
        createdAt: new Date(),
      });
    }

    const result = await stationRepository.createMany(stations);

    auditRepository.createLog({
      actorId,
      action: 'BULK_IMPORT_STATIONS',
      collection: 'stations',
      documentId: 'bulk',
      after: { importedCount: result.insertedCount },
      ip,
    });

    return { importedCount: result.insertedCount };
  }

  async getStations({
    search,
    area,
    status,
    connector,
    minPowerKW,
    sort = 'createdAt',
    order = 'desc',
    page = 1,
    limit = 20,
  }) {
    const filter = {};
    if (area) filter.area = area;
    if (status) filter.status = status;
    if (connector) filter.connector = connector;
    if (minPowerKW) filter.minPowerKW = minPowerKW;

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const sortObj = {};
    if (sort === 'tariff') {
      sortObj.tariffPerKWh = order === 'asc' ? 1 : -1;
    } else if (sort === 'name') {
      sortObj.name = order === 'asc' ? 1 : -1;
    } else {
      sortObj.createdAt = order === 'asc' ? 1 : -1;
    }

    if (search && search.trim()) {
      return stationRepository.searchByText(search.trim(), { filter, skip, limit: Number(limit) });
    }

    return stationRepository.findStations({ filter, sort: sortObj, skip, limit: Number(limit) });
  }

  async getStationById(id) {
    const station = await stationRepository.findById(id);
    if (!station) {
      throw new NotFoundError('Station not found');
    }
    return station;
  }

  async getNearestStations({ lng, lat, maxDistance, limit, onlyAvailable }) {
    return stationRepository.findNearest({
      coordinates: [Number(lng), Number(lat)],
      maxDistance,
      limit,
      onlyAvailable,
    });
  }

  async getStationsWithinCircle({ lng, lat, radiusMeters }) {
    return stationRepository.findWithinCircle({
      centerLng: Number(lng),
      centerLat: Number(lat),
      radiusMeters: Number(radiusMeters),
    });
  }

  async getStationsWithinPolygon(polygonCoordinates) {
    return stationRepository.findWithinPolygon(polygonCoordinates);
  }

  async updateStation(id, updateData, actorId, ip) {
    const before = await stationRepository.findById(id);
    if (!before) throw new NotFoundError('Station not found');

    await stationRepository.update(id, updateData);
    const after = await stationRepository.findById(id);

    auditRepository.createLog({
      actorId,
      action: 'UPDATE_STATION',
      collection: 'stations',
      documentId: id,
      before,
      after,
      ip,
    });

    return after;
  }

  async updateTariff(id, tariffPerKWh, actorId, ip) {
    const before = await stationRepository.findById(id);
    if (!before) throw new NotFoundError('Station not found');

    await stationRepository.updateTariff(id, tariffPerKWh);
    const after = await stationRepository.findById(id);

    auditRepository.createLog({
      actorId,
      action: 'UPDATE_TARIFF',
      collection: 'stations',
      documentId: id,
      before: { tariffPerKWh: before.tariffPerKWh },
      after: { tariffPerKWh: after.tariffPerKWh },
      ip,
    });

    return after;
  }

  async toggleStatus(id, status, actorId, ip) {
    const before = await stationRepository.findById(id);
    if (!before) throw new NotFoundError('Station not found');

    await stationRepository.updateStatus(id, status);
    const after = await stationRepository.findById(id);

    auditRepository.createLog({
      actorId,
      action: 'UPDATE_STATION_STATUS',
      collection: 'stations',
      documentId: id,
      before: { status: before.status },
      after: { status: after.status },
      ip,
    });

    return after;
  }

  async softDelete(id, actorId, ip) {
    const before = await stationRepository.findById(id);
    if (!before) throw new NotFoundError('Station not found');

    await stationRepository.softDelete(id);
    const after = await stationRepository.findById(id);

    auditRepository.createLog({
      actorId,
      action: 'DECOMMISSION_STATION',
      collection: 'stations',
      documentId: id,
      before,
      after,
      ip,
    });

    return after;
  }

  async hardDelete(id, actorId, ip) {
    const before = await stationRepository.findById(id);
    if (!before) throw new NotFoundError('Station not found');

    await stationRepository.hardDeleteWithCascadeCheck(id);

    auditRepository.createLog({
      actorId,
      action: 'HARD_DELETE_STATION',
      collection: 'stations',
      documentId: id,
      before,
      after: null,
      ip,
    });

    return { success: true, message: 'Station and associated history deleted successfully' };
  }

  async addCharger(stationId, chargerDoc, actorId, ip) {
    const station = await stationRepository.findById(stationId);
    if (!station) throw new NotFoundError('Station not found');

    await stationRepository.addCharger(stationId, chargerDoc);
    const after = await stationRepository.findById(stationId);

    auditRepository.createLog({
      actorId,
      action: 'ADD_CHARGER',
      collection: 'stations',
      documentId: stationId,
      after: chargerDoc,
      ip,
    });

    return after;
  }

  async removeCharger(stationId, chargerId, actorId, ip) {
    const station = await stationRepository.findById(stationId);
    if (!station) throw new NotFoundError('Station not found');

    await stationRepository.removeCharger(stationId, chargerId);
    const after = await stationRepository.findById(stationId);

    auditRepository.createLog({
      actorId,
      action: 'REMOVE_CHARGER',
      collection: 'stations',
      documentId: stationId,
      after: { removedChargerId: chargerId },
      ip,
    });

    return after;
  }

  async updateCharger(stationId, chargerId, updateDoc, actorId, ip) {
    const station = await stationRepository.findById(stationId);
    if (!station) throw new NotFoundError('Station not found');

    await stationRepository.updateCharger(stationId, chargerId, updateDoc);
    const after = await stationRepository.findById(stationId);

    auditRepository.createLog({
      actorId,
      action: 'UPDATE_CHARGER',
      collection: 'stations',
      documentId: stationId,
      after: { chargerId, ...updateDoc },
      ip,
    });

    return after;
  }

  async bulkSyncChargers(stationId, updates, actorId, ip) {
    const station = await stationRepository.findById(stationId);
    if (!station) throw new NotFoundError('Station not found');

    const result = await stationRepository.bulkSyncChargerStatuses(stationId, updates);
    const after = await stationRepository.findById(stationId);

    auditRepository.createLog({
      actorId,
      action: 'BULK_SYNC_CHARGERS',
      collection: 'stations',
      documentId: stationId,
      after: { modifiedCount: result.modifiedCount },
      ip,
    });

    return { modifiedCount: result.modifiedCount, station: after };
  }
}

export const stationService = new StationService();
