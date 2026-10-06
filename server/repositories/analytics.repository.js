import { getDB } from '../config/db.js';

export class AnalyticsRepository {
  /**
   * Peak-hour load pipeline ($project, $hour, $group, $sort)
   */
  async getPeakHourLoad() {
    const pipeline = [
      {
        $project: {
          hour: { $hour: { date: '$startedAt', timezone: '+05:30' } },
          energyKWh: '$energyKWh',
          cost: '$cost',
        },
      },
      {
        $group: {
          _id: '$hour',
          totalSessions: { $sum: 1 },
          totalEnergyKWh: { $sum: '$energyKWh' },
          totalRevenue: { $sum: '$cost' },
          avgEnergyKWh: { $avg: '$energyKWh' },
        },
      },
      {
        $project: {
          _id: 0,
          hour: '$_id',
          totalSessions: 1,
          totalEnergyKWh: { $round: ['$totalEnergyKWh', 2] },
          totalRevenue: { $round: ['$totalRevenue', 2] },
          avgEnergyKWh: { $round: ['$avgEnergyKWh', 2] },
        },
      },
      { $sort: { hour: 1 } },
    ];

    return getDB().collection('sessions').aggregate(pipeline).toArray();
  }

  /**
   * Station utilisation & revenue pipeline ($lookup, $project, $sort)
   */
  async getStationPerformance() {
    const pipeline = [
      {
        $lookup: {
          from: 'sessions',
          localField: '_id',
          foreignField: 'stationId',
          as: 'stationSessions',
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          area: 1,
          operator: 1,
          tariffPerKWh: 1,
          status: 1,
          chargerCount: { $size: { $ifNull: ['$chargers', []] } },
          totalSessions: { $size: '$stationSessions' },
          totalEnergyKWh: {
            $round: [{ $sum: '$stationSessions.energyKWh' }, 2],
          },
          totalRevenue: {
            $round: [{ $sum: '$stationSessions.cost' }, 2],
          },
          avgDurationMinutes: {
            $round: [
              {
                $cond: {
                  if: { $gt: [{ $size: '$stationSessions' }, 0] },
                  then: {
                    $avg: {
                      $map: {
                        input: '$stationSessions',
                        as: 's',
                        in: {
                          $divide: [
                            {
                              $subtract: [
                                { $ifNull: ['$$s.endedAt', '$$s.startedAt'] },
                                '$$s.startedAt',
                              ],
                            },
                            60000,
                          ],
                        },
                      },
                    },
                  },
                  else: 0,
                },
              },
              1,
            ],
          },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ];

    return getDB().collection('stations').aggregate(pipeline).toArray();
  }

  /**
   * Area revenue and demand breakdown with $facet
   */
  async getAreaRevenueBreakdown() {
    const pipeline = [
      {
        $lookup: {
          from: 'stations',
          localField: 'stationId',
          foreignField: '_id',
          as: 'station',
        },
      },
      { $unwind: '$station' },
      {
        $facet: {
          byArea: [
            {
              $group: {
                _id: '$station.area',
                totalSessions: { $sum: 1 },
                totalRevenue: { $sum: '$cost' },
                totalEnergyKWh: { $sum: '$energyKWh' },
              },
            },
            {
              $project: {
                _id: 0,
                area: '$_id',
                totalSessions: 1,
                totalRevenue: { $round: ['$totalRevenue', 2] },
                totalEnergyKWh: { $round: ['$totalEnergyKWh', 2] },
              },
            },
            { $sort: { totalRevenue: -1 } },
          ],
          totals: [
            {
              $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                totalRevenue: { $sum: '$cost' },
                totalEnergyKWh: { $sum: '$energyKWh' },
                avgRevenuePerSession: { $avg: '$cost' },
              },
            },
            {
              $project: {
                _id: 0,
                totalSessions: 1,
                totalRevenue: { $round: ['$totalRevenue', 2] },
                totalEnergyKWh: { $round: ['$totalEnergyKWh', 2] },
                avgRevenuePerSession: { $round: ['$avgRevenuePerSession', 2] },
              },
            },
          ],
        },
      },
    ];

    const result = await getDB().collection('sessions').aggregate(pipeline).toArray();
    return result[0] || { byArea: [], totals: [] };
  }

  /**
   * Session duration distribution using $bucket
   */
  async getDurationDistribution() {
    const pipeline = [
      {
        $match: { endedAt: { $exists: true } },
      },
      {
        $project: {
          durationMinutes: {
            $divide: [{ $subtract: ['$endedAt', '$startedAt'] }, 60000],
          },
          cost: '$cost',
          energyKWh: '$energyKWh',
        },
      },
      {
        $bucket: {
          groupBy: '$durationMinutes',
          boundaries: [0, 30, 60, 120, 240, 480],
          default: '480+',
          output: {
            count: { $sum: 1 },
            totalRevenue: { $sum: '$cost' },
            avgEnergyKWh: { $avg: '$energyKWh' },
          },
        },
      },
      {
        $project: {
          _id: 1,
          count: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          avgEnergyKWh: { $round: [{ $ifNull: ['$avgEnergyKWh', 0] }, 2] },
        },
      },
    ];

    return getDB().collection('sessions').aggregate(pipeline).toArray();
  }

  /**
   * 7-day rolling average energy using $setWindowFields
   */
  async getRollingAverages() {
    const pipeline = [
      { $sort: { stationId: 1, date: 1 } },
      {
        $setWindowFields: {
          partitionBy: '$stationId',
          sortBy: { date: 1 },
          output: {
            rollingAvgEnergyKWh: {
              $avg: '$totalEnergyKWh',
              window: {
                documents: [-6, 'current'],
              },
            },
            rollingTotalRevenue: {
              $sum: '$totalRevenue',
              window: {
                documents: [-6, 'current'],
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: 'stations',
          localField: 'stationId',
          foreignField: '_id',
          as: 'station',
        },
      },
      {
        $project: {
          stationId: 1,
          stationName: { $arrayElemAt: ['$station.name', 0] },
          area: { $arrayElemAt: ['$station.area', 0] },
          date: 1,
          totalSessions: 1,
          totalEnergyKWh: 1,
          totalRevenue: 1,
          rollingAvgEnergyKWh: { $round: ['$rollingAvgEnergyKWh', 2] },
          rollingTotalRevenue: { $round: ['$rollingTotalRevenue', 2] },
        },
      },
      { $sort: { date: -1 } },
      { $limit: 100 },
    ];

    return getDB().collection('daily_station_stats').aggregate(pipeline).toArray();
  }

  /**
   * On-demand / scheduled aggregation pipeline that $merge into daily_station_stats
   */
  async refreshDailyStationStats() {
    const pipeline = [
      {
        $match: {
          endedAt: { $exists: true },
        },
      },
      {
        $project: {
          stationId: 1,
          date: {
            $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: '+05:30' },
          },
          hour: { $hour: { date: '$startedAt', timezone: '+05:30' } },
          energyKWh: '$energyKWh',
          cost: '$cost',
        },
      },
      {
        $group: {
          _id: { stationId: '$stationId', date: '$date' },
          totalSessions: { $sum: 1 },
          totalEnergyKWh: { $sum: '$energyKWh' },
          totalRevenue: { $sum: '$cost' },
          peakHour: { $first: '$hour' },
        },
      },
      {
        $project: {
          _id: 0,
          stationId: '$_id.stationId',
          date: '$_id.date',
          totalSessions: '$totalSessions',
          totalEnergyKWh: { $round: ['$totalEnergyKWh', 2] },
          totalRevenue: { $round: ['$totalRevenue', 2] },
          peakHour: '$peakHour',
          updatedAt: new Date(),
        },
      },
      {
        $merge: {
          into: 'daily_station_stats',
          on: ['stationId', 'date'],
          whenMatched: 'merge',
          whenNotMatched: 'insert',
        },
      },
    ];

    await getDB().collection('sessions').aggregate(pipeline).toArray();
    return { success: true, message: 'daily_station_stats successfully refreshed via $merge' };
  }

  /**
   * Suggested new charger locations based on booking pressure vs charger supply
   */
  async getSuggestedLocations() {
    const db = getDB();

    // 1. Charger count per area
    const stationAreaCounts = await db
      .collection('stations')
      .aggregate([
        { $unwind: '$chargers' },
        {
          $group: {
            _id: '$area',
            chargerCount: { $sum: 1 },
            stationCount: { $addToSet: '$_id' },
          },
        },
        {
          $project: {
            area: '$_id',
            chargerCount: 1,
            stationCount: { $size: '$stationCount' },
            _id: 0,
          },
        },
      ])
      .toArray();

    // 2. Booking demand per area
    const bookingDemand = await db
      .collection('bookings')
      .aggregate([
        {
          $lookup: {
            from: 'stations',
            localField: 'stationId',
            foreignField: '_id',
            as: 'station',
          },
        },
        { $unwind: '$station' },
        {
          $group: {
            _id: '$station.area',
            bookingCount: { $sum: 1 },
          },
        },
        {
          $project: {
            area: '$_id',
            bookingCount: 1,
            _id: 0,
          },
        },
      ])
      .toArray();

    const areaMap = new Map();
    stationAreaCounts.forEach(s => {
      areaMap.set(s.area, { ...s, bookingCount: 0 });
    });
    bookingDemand.forEach(b => {
      const entry = areaMap.get(b.area) || { area: b.area, chargerCount: 1, stationCount: 1 };
      entry.bookingCount = b.bookingCount;
      areaMap.set(b.area, entry);
    });

    const suggestions = Array.from(areaMap.values()).map(item => {
      const demandRatio = (item.bookingCount / Math.max(1, item.chargerCount)).toFixed(2);
      let recommendation = 'Adequate Capacity';
      let priority = 'low';

      if (demandRatio > 15) {
        recommendation = 'Urgent: Deploy +4 DC Fast Dispensers';
        priority = 'high';
      } else if (demandRatio > 10) {
        recommendation = 'Moderate: Expand +2 Dispensers';
        priority = 'medium';
      }

      return {
        ...item,
        demandRatio: Number(demandRatio),
        recommendation,
        priority,
      };
    });

    return suggestions.sort((a, b) => b.demandRatio - a.demandRatio);
  }
}

export const analyticsRepository = new AnalyticsRepository();
