import { analyticsService } from '../services/analytics.service.js';

export class AnalyticsController {
  async getPeakHours(req, res, next) {
    try {
      const data = await analyticsService.getPeakHourLoad();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getStationsPerformance(req, res, next) {
    try {
      const data = await analyticsService.getStationPerformance();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getAreaBreakdown(req, res, next) {
    try {
      const data = await analyticsService.getAreaRevenueBreakdown();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getDurationDistribution(req, res, next) {
    try {
      const data = await analyticsService.getDurationDistribution();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getRollingAverage(req, res, next) {
    try {
      const data = await analyticsService.getRollingAverages();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async refreshDailyStats(req, res, next) {
    try {
      const result = await analyticsService.refreshDailyStationStats();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getSuggestedLocations(req, res, next) {
    try {
      const data = await analyticsService.getSuggestedLocations();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async exportStationsCSV(req, res, next) {
    try {
      const data = await analyticsService.getStationPerformance();
      const csv = analyticsService.generateStationsCSV(data);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="voltgrid_station_performance.csv"'
      );
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  async exportRevenueCSV(req, res, next) {
    try {
      const breakdown = await analyticsService.getAreaRevenueBreakdown();
      const csv = analyticsService.generateAreaCSV(breakdown.byArea || []);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="voltgrid_area_revenue.csv"');
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
