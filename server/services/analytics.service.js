import { analyticsRepository } from '../repositories/analytics.repository.js';

export class AnalyticsService {
  async getPeakHourLoad() {
    return analyticsRepository.getPeakHourLoad();
  }

  async getStationPerformance() {
    return analyticsRepository.getStationPerformance();
  }

  async getAreaRevenueBreakdown() {
    return analyticsRepository.getAreaRevenueBreakdown();
  }

  async getDurationDistribution() {
    return analyticsRepository.getDurationDistribution();
  }

  async getRollingAverages() {
    return analyticsRepository.getRollingAverages();
  }

  async refreshDailyStationStats() {
    return analyticsRepository.refreshDailyStationStats();
  }

  async getSuggestedLocations() {
    return analyticsRepository.getSuggestedLocations();
  }

  generateStationsCSV(stations) {
    const headers = [
      'Station ID',
      'Name',
      'Area',
      'Operator',
      'Status',
      'Chargers',
      'Tariff (INR/kWh)',
      'Total Sessions',
      'Total Energy (kWh)',
      'Total Revenue (INR)',
      'Avg Duration (min)',
    ];

    const rows = stations.map(s => [
      `"${s._id}"`,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.area}"`,
      `"${s.operator.replace(/"/g, '""')}"`,
      `"${s.status}"`,
      s.chargerCount,
      s.tariffPerKWh,
      s.totalSessions,
      s.totalEnergyKWh,
      s.totalRevenue,
      s.avgDurationMinutes,
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  generateAreaCSV(areas) {
    const headers = ['Area', 'Total Sessions', 'Total Energy (kWh)', 'Total Revenue (INR)'];

    const rows = areas.map(a => [`"${a.area}"`, a.totalSessions, a.totalEnergyKWh, a.totalRevenue]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }
}

export const analyticsService = new AnalyticsService();
