/**
 * VoltGrid Grid Analytics & Aggregation Intelligence View
 * Displays peak-hour loads, area breakdowns, rolling averages, dwell times, and expansion suggestions.
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';

export const AnalyticsView = {
  async render(container) {
    if (!state.isAuthenticated) {
      container.innerHTML = `
        <div class="container" style="padding-top: var(--space-2xl); text-align: center;">
          <div class="card" style="max-width: 500px; margin: 0 auto; padding: 2rem;">
            <h2>Authentication Required</h2>
            <p style="color: var(--text-secondary); margin: 1rem 0 1.5rem 0;">
              Please sign in with operator or admin credentials to view grid analytics.
            </p>
            <a href="#/login?redirect=analytics" class="btn btn-primary">Sign In</a>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="analytics-view-wrapper container" style="padding-top: var(--space-lg); padding-bottom: var(--space-2xl);">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="hero-badge">Grid Intelligence</span>
              <span class="badge badge-info">MongoDB Aggregation Framework</span>
            </div>
            <h1 style="font-size: 2rem; font-weight: 800; margin-top: 0.5rem;">Network Analytics & Load Distribution</h1>
            <p style="color: var(--text-secondary); font-size: 0.95rem; margin-top: 0.25rem;">
              Real-time calculations across metropolitan Bengaluru EV corridors via $project, $facet, $bucket, and $setWindowFields.
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <a href="/api/analytics/export/stations-csv" class="btn btn-secondary btn-sm" download>
              📥 Export Stations CSV
            </a>
            <a href="/api/analytics/export/revenue-csv" class="btn btn-secondary btn-sm" download>
              📥 Export Revenue CSV
            </a>
            <button id="btn-refresh-stats" class="btn btn-primary btn-sm" type="button">
              ⚡ Run $merge Pipeline
            </button>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Total Network Revenue</div>
            <div id="kpi-revenue" style="font-size: 1.8rem; font-weight: 800; color: var(--status-available); margin-top: 0.25rem; font-family: var(--font-mono);">
              ...
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Prepaid wallet debits</div>
          </div>
          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Energy Delivered</div>
            <div id="kpi-energy" style="font-size: 1.8rem; font-weight: 800; color: var(--accent-primary); margin-top: 0.25rem; font-family: var(--font-mono);">
              ...
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">High-voltage dispense</div>
          </div>
          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Charging Sessions</div>
            <div id="kpi-sessions" style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-top: 0.25rem; font-family: var(--font-mono);">
              ...
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Across 16 Bengaluru hubs</div>
          </div>
          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Avg Revenue / Session</div>
            <div id="kpi-avg-rev" style="font-size: 1.8rem; font-weight: 800; color: var(--accent-warning); margin-top: 0.25rem; font-family: var(--font-mono);">
              ...
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Mean dwell settlement</div>
          </div>
        </div>

        <!-- Charts Grid 1: Peak Hours + Area Breakdown -->
        <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
          <!-- Hourly Load Chart -->
          <div class="card" style="padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <div>
                <h2 style="font-size: 1.15rem; font-weight: 700; margin: 0;">Hourly Grid Demand (Peak Load)</h2>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">$project, $hour, and $group over sessions</div>
              </div>
              <span class="badge badge-info">24h Diurnal</span>
            </div>
            <div id="chart-peak-hours" style="height: 240px; display: flex; align-items: flex-end; gap: 4px; padding-top: 20px;">
              <div style="margin: auto; color: var(--text-muted);">Loading hourly load...</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem;">
              <span>00:00</span>
              <span>06:00 (Morning Rush)</span>
              <span>12:00</span>
              <span>18:00 (Evening Peak)</span>
              <span>23:00</span>
            </div>
          </div>

          <!-- Area Revenue Facet -->
          <div class="card" style="padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <div>
                <h2 style="font-size: 1.15rem; font-weight: 700; margin: 0;">Revenue by Corridor ($facet)</h2>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Zonal distribution across Bengaluru</div>
              </div>
            </div>
            <div id="area-breakdown-list" style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 260px; overflow-y: auto;">
              <div style="margin: auto; color: var(--text-muted);">Loading area revenue...</div>
            </div>
          </div>
        </div>

        <!-- Charts Grid 2: Duration Distribution ($bucket) + Rolling Average ($setWindowFields) -->
        <div style="display: grid; grid-template-columns: 1fr 1.4fr; gap: 1.5rem; margin-bottom: 2rem;">
          <!-- Dwell Time Buckets -->
          <div class="card" style="padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <div>
                <h2 style="font-size: 1.15rem; font-weight: 700; margin: 0;">Dwell Time Buckets ($bucket)</h2>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Turnover & occupancy dwell windows</div>
              </div>
              <span class="badge badge-info">OCPP Dwell</span>
            </div>
            <div id="duration-bucket-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
              <div style="margin: auto; color: var(--text-muted);">Loading duration buckets...</div>
            </div>
          </div>

          <!-- Rolling Average Insights -->
          <div class="card" style="padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <div>
                <h2 style="font-size: 1.15rem; font-weight: 700; margin: 0;">7-Day Rolling Energy ($setWindowFields)</h2>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Station daily smoothing window: [-6, 0] days</div>
              </div>
            </div>
            <div id="rolling-stats-list" style="max-height: 240px; overflow-y: auto;">
              <div style="margin: auto; color: var(--text-muted); text-align: center; padding: 2rem;">Loading window averages...</div>
            </div>
          </div>
        </div>

        <!-- Expansion Suggestions Section -->
        <div class="card" style="padding: 1.5rem; margin-bottom: 2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0;">Grid Capacity & Expansion Recommendations</h2>
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.2rem;">
                Automated demand-to-dispenser ratio analysis identifying high-congestion Bengaluru zones.
              </p>
            </div>
          </div>
          <div class="table-responsive">
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.85rem;">
                  <th style="padding: 0.75rem;">Bengaluru Locality</th>
                  <th style="padding: 0.75rem;">Active Hubs</th>
                  <th style="padding: 0.75rem;">Dispensers</th>
                  <th style="padding: 0.75rem;">Reservations</th>
                  <th style="padding: 0.75rem;">Demand Ratio</th>
                  <th style="padding: 0.75rem;">Deployment Recommendation</th>
                </tr>
              </thead>
              <tbody id="table-expansion-body">
                <tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Analyzing network demand...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Station Performance Table -->
        <div class="card" style="padding: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0;">Hub Performance Leaderboard ($lookup)</h2>
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.2rem;">
                Station-by-station revenue, energy throughput, and average charging duration.
              </p>
            </div>
          </div>
          <div class="table-responsive">
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.85rem;">
                  <th style="padding: 0.75rem;">Charging Hub</th>
                  <th style="padding: 0.75rem;">Zone</th>
                  <th style="padding: 0.75rem;">Chargers</th>
                  <th style="padding: 0.75rem;">Tariff</th>
                  <th style="padding: 0.75rem;">Total Sessions</th>
                  <th style="padding: 0.75rem;">Energy (kWh)</th>
                  <th style="padding: 0.75rem;">Revenue (₹)</th>
                  <th style="padding: 0.75rem;">Avg Dwell</th>
                </tr>
              </thead>
              <tbody id="table-stations-body">
                <tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading hub performance...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Hook up refresh stats button
    document.getElementById('btn-refresh-stats')?.addEventListener('click', async () => {
      try {
        toast.info('Executing $merge pipeline into daily_station_stats...');
        const res = await api.post('/analytics/refresh-daily-stats', {});
        toast.success(res.message || 'Daily station stats refreshed!');
        await this.loadAllAnalytics();
      } catch (err) {
        toast.error('Failed to run $merge pipeline: ' + err.message);
      }
    });

    await this.loadAllAnalytics();
  },

  async loadAllAnalytics() {
    try {
      const [peakRes, areaRes, durationRes, rollingRes, expansionRes, stationsRes] =
        await Promise.all([
          api.get('/analytics/peak-hours'),
          api.get('/analytics/area-breakdown'),
          api.get('/analytics/duration-distribution'),
          api.get('/analytics/rolling-average'),
          api.get('/analytics/expansion-suggestions'),
          api.get('/analytics/stations'),
        ]);

      // 1. KPIs
      const totals = areaRes.data?.totals?.[0] || {};
      document.getElementById('kpi-revenue').textContent =
        `₹${(totals.totalRevenue || 0).toLocaleString('en-IN')}`;
      document.getElementById('kpi-energy').textContent =
        `${(totals.totalEnergyKWh || 0).toLocaleString('en-IN')} kWh`;
      document.getElementById('kpi-sessions').textContent =
        `${(totals.totalSessions || 0).toLocaleString('en-IN')}`;
      document.getElementById('kpi-avg-rev').textContent =
        `₹${(totals.avgRevenuePerSession || 0).toFixed(2)}`;

      // 2. Render Peak Hours Bar Chart
      this.renderPeakHoursChart(peakRes.data || []);

      // 3. Render Area Breakdown
      this.renderAreaBreakdown(areaRes.data?.byArea || []);

      // 4. Render Dwell Time Buckets
      this.renderDurationBuckets(durationRes.data || []);

      // 5. Render Rolling Averages
      this.renderRollingAverages(rollingRes.data || []);

      // 6. Render Expansion Suggestions
      this.renderExpansionTable(expansionRes.data || []);

      // 7. Render Stations Performance Table
      this.renderStationsTable(stationsRes.data || []);
    } catch (error) {
      toast.error('Failed to load analytics: ' + error.message);
    }
  },

  renderPeakHoursChart(data) {
    const container = document.getElementById('chart-peak-hours');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML =
        '<div style="margin: auto; color: var(--text-muted);">No session load recorded yet</div>';
      return;
    }

    const maxSessions = Math.max(...data.map(d => d.totalSessions), 1);
    const hourMap = new Map();
    data.forEach(d => hourMap.set(d.hour, d));

    let html = '';
    for (let h = 0; h < 24; h++) {
      const d = hourMap.get(h) || { totalSessions: 0, totalEnergyKWh: 0 };
      const pct = Math.max(4, Math.round((d.totalSessions / maxSessions) * 100));
      const isPeak = (h >= 8 && h <= 11) || (h >= 17 && h <= 21);
      const barColor = isPeak ? 'var(--accent-warning)' : 'var(--accent-primary)';

      html += `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end;" title="${h}:00 - ${d.totalSessions} sessions (${d.totalEnergyKWh} kWh)">
          <div style="width: 100%; height: ${pct}%; background: ${barColor}; border-radius: 2px 2px 0 0; transition: height 0.3s ease;"></div>
        </div>
      `;
    }

    container.innerHTML = html;
  },

  renderAreaBreakdown(byArea) {
    const container = document.getElementById('area-breakdown-list');
    if (!container) return;

    if (!byArea || byArea.length === 0) {
      container.innerHTML =
        '<div style="margin: auto; color: var(--text-muted);">No area metrics found</div>';
      return;
    }

    const totalRev = byArea.reduce((acc, a) => acc + a.totalRevenue, 0) || 1;

    container.innerHTML = byArea
      .map(item => {
        const pct = Math.round((item.totalRevenue / totalRev) * 100);
        return `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
              <span style="font-weight: 600;">${item.area}</span>
              <span style="font-family: var(--font-mono); color: var(--text-secondary);">
                ₹${item.totalRevenue.toLocaleString('en-IN')} (${pct}%)
              </span>
            </div>
            <div style="height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: var(--status-available);"></div>
            </div>
          </div>
        `;
      })
      .join('');
  },

  renderDurationBuckets(buckets) {
    const container = document.getElementById('duration-bucket-list');
    if (!container) return;

    if (!buckets || buckets.length === 0) {
      container.innerHTML =
        '<div style="margin: auto; color: var(--text-muted);">No duration data</div>';
      return;
    }

    const totalCount = buckets.reduce((acc, b) => acc + b.count, 0) || 1;

    const labelMap = {
      0: 'Quick Top-up (< 30 min)',
      30: 'Standard Dwell (30 - 60 min)',
      60: 'Extended Dwell (1 - 2 hrs)',
      120: 'Long Stay (2 - 4 hrs)',
      240: 'Fleet Dwell (4 - 8 hrs)',
      '480+': 'Overnight Stay (8+ hrs)',
    };

    container.innerHTML = buckets
      .map(b => {
        const label = labelMap[b._id] || `${b._id} min`;
        const pct = Math.round((b.count / totalCount) * 100);
        return `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
              <span>${label}</span>
              <span style="font-family: var(--font-mono); font-weight: 600;">
                ${b.count} (${pct}%)
              </span>
            </div>
            <div style="height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: var(--accent-primary);"></div>
            </div>
          </div>
        `;
      })
      .join('');
  },

  renderRollingAverages(records) {
    const container = document.getElementById('rolling-stats-list');
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML =
        '<div style="padding: 1rem; color: var(--text-muted); text-align: center;">No daily summary stats found</div>';
      return;
    }

    container.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead>
          <tr style="text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">
            <th style="padding: 0.5rem;">Station</th>
            <th style="padding: 0.5rem;">Date</th>
            <th style="padding: 0.5rem;">Energy</th>
            <th style="padding: 0.5rem;">7-Day Rolling Avg</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .slice(0, 15)
            .map(
              r => `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 0.5rem; font-weight: 600;">${r.stationName || 'Station Hub'}</td>
              <td style="padding: 0.5rem; color: var(--text-muted); font-family: var(--font-mono);">${r.date}</td>
              <td style="padding: 0.5rem; font-family: var(--font-mono);">${r.totalEnergyKWh} kWh</td>
              <td style="padding: 0.5rem; font-family: var(--font-mono); color: var(--status-available); font-weight: 700;">
                ${r.rollingAvgEnergyKWh} kWh
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  },

  renderExpansionTable(suggestions) {
    const tbody = document.getElementById('table-expansion-body');
    if (!tbody) return;

    tbody.innerHTML = suggestions
      .map(s => {
        const badgeClass =
          s.priority === 'high'
            ? 'badge-faulted'
            : s.priority === 'medium'
              ? 'badge-warning'
              : 'badge-success';

        return `
          <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
            <td style="padding: 0.75rem; font-weight: 700;">${s.area}</td>
            <td style="padding: 0.75rem;">${s.stationCount}</td>
            <td style="padding: 0.75rem;">${s.chargerCount}</td>
            <td style="padding: 0.75rem;">${s.bookingCount}</td>
            <td style="padding: 0.75rem; font-family: var(--font-mono); font-weight: 700;">
              ${s.demandRatio} bookings/dispenser
            </td>
            <td style="padding: 0.75rem;">
              <span class="badge ${badgeClass}">${s.recommendation}</span>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  renderStationsTable(stations) {
    const tbody = document.getElementById('table-stations-body');
    if (!tbody) return;

    tbody.innerHTML = stations
      .map(
        s => `
        <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
          <td style="padding: 0.75rem; font-weight: 700;">${s.name}</td>
          <td style="padding: 0.75rem; color: var(--text-secondary);">${s.area}</td>
          <td style="padding: 0.75rem;">${s.chargerCount}</td>
          <td style="padding: 0.75rem; font-family: var(--font-mono);">₹${s.tariffPerKWh}</td>
          <td style="padding: 0.75rem; font-family: var(--font-mono);">${s.totalSessions}</td>
          <td style="padding: 0.75rem; font-family: var(--font-mono);">${s.totalEnergyKWh} kWh</td>
          <td style="padding: 0.75rem; font-family: var(--font-mono); font-weight: 700; color: var(--status-available);">
            ₹${s.totalRevenue.toLocaleString('en-IN')}
          </td>
          <td style="padding: 0.75rem; color: var(--text-muted);">${s.avgDurationMinutes} min</td>
        </tr>
      `
      )
      .join('');
  },

  destroy() {},
};
