import { stationService } from '../services/station.service.js';

export class StationController {
  async create(req, res, next) {
    try {
      const station = await stationService.createStation(req.body, req.user._id, req.ip);
      res.status(201).json({
        success: true,
        data: station,
        message: 'Station created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async bulkImport(req, res, next) {
    try {
      const csvData = req.body?.csv || req.body;
      const result = await stationService.importStationsFromCSV(
        typeof csvData === 'string' ? csvData : JSON.stringify(csvData),
        req.user._id,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: result,
        message: `Successfully imported ${result.importedCount} stations`,
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const result = await stationService.getStations(req.query);
      res.status(200).json({
        success: true,
        data: result.stations,
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

  async getById(req, res, next) {
    try {
      const station = await stationService.getStationById(req.params.id);
      res.status(200).json({
        success: true,
        data: station,
      });
    } catch (error) {
      next(error);
    }
  }

  async getNearest(req, res, next) {
    try {
      const stations = await stationService.getNearestStations(req.query);
      res.status(200).json({
        success: true,
        data: stations,
      });
    } catch (error) {
      next(error);
    }
  }

  async getWithinCircle(req, res, next) {
    try {
      const stations = await stationService.getStationsWithinCircle(req.query);
      res.status(200).json({
        success: true,
        data: stations,
      });
    } catch (error) {
      next(error);
    }
  }

  async getWithinPolygon(req, res, next) {
    try {
      const coordinates = req.body?.coordinates;
      const stations = await stationService.getStationsWithinPolygon(coordinates);
      res.status(200).json({
        success: true,
        data: stations,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const updated = await stationService.updateStation(
        req.params.id,
        req.body,
        req.user._id,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Station updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTariff(req, res, next) {
    try {
      const updated = await stationService.updateTariff(
        req.params.id,
        req.body.tariffPerKWh,
        req.user._id,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Tariff updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req, res, next) {
    try {
      const updated = await stationService.toggleStatus(
        req.params.id,
        req.body.status,
        req.user._id,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Status updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async softDelete(req, res, next) {
    try {
      const decommissioned = await stationService.softDelete(req.params.id, req.user._id, req.ip);
      res.status(200).json({
        success: true,
        data: decommissioned,
        message: 'Station decommissioned successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async hardDelete(req, res, next) {
    try {
      const result = await stationService.hardDelete(req.params.id, req.user._id, req.ip);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async addCharger(req, res, next) {
    try {
      const station = await stationService.addCharger(
        req.params.id,
        req.body,
        req.user._id,
        req.ip
      );
      res.status(201).json({
        success: true,
        data: station,
        message: 'Charger bay added successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async removeCharger(req, res, next) {
    try {
      const station = await stationService.removeCharger(
        req.params.id,
        req.params.chargerId,
        req.user._id,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: station,
        message: 'Charger bay removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCharger(req, res, next) {
    try {
      const station = await stationService.updateCharger(
        req.params.id,
        req.params.chargerId,
        req.body,
        req.user._id,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: station,
        message: 'Charger updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async bulkSyncChargers(req, res, next) {
    try {
      const result = await stationService.bulkSyncChargers(
        req.params.id,
        req.body.updates,
        req.user._id,
        req.ip
      );
      res.status(200).json({
        success: true,
        data: result,
        message: `Successfully synchronized ${result.modifiedCount} charger status(es)`,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const stationController = new StationController();
