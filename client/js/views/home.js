/**
 * VoltGrid Home / Executive Dashboard View
 */

import { api } from '../api.js';
import { state } from '../state.js';

export const HomeView = {
  async render(container) {
    container.innerHTML = `
      <section class="hero-card card-hover-lift" style="margin-bottom:2rem;">
        <div class="hero-badge">VoltGrid Infrastructure • Bengaluru Metropolitan Grid</div>
        <h1 class="hero-title">Metropolitan EV Charging Management Platform</h1>
        <p class="hero-subtitle">
          Intelligent grid discovery, conflict-free charging reservations, real-time telemetry analytics, and autonomous operator tools.
        </p>

        <div style="display:flex; flex-wrap:wrap; gap:1rem; margin-top:1.5rem;">
          <a href="#/map" class="btn btn-primary">🗺️ Open Network Map</a>
          <a href="#/stations" class="btn btn-secondary">⚡ Browse Stations</a>
          ${
            state.isAuthenticated
              ? `<a href="#/bookings" class="btn btn-secondary">📅 My Bookings</a>`
              : `<a href="#/register" class="btn btn-secondary">📝 Register Driver Account</a>`
          }
        </div>
      </section>

      <!-- Network Live Metrics Section -->
      <section style="margin-bottom:2.5rem;">
        <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
          <span>Live Grid Telemetry & Capacity</span>
          <span id="metric-indicator" class="status-dot status-ok"></span>
        </h2>

        <div class="metrics-grid">
          <div class="metric-card card-hover-lift">
            <div class="metric-label">Active Charging Hubs</div>
            <div class="metric-value" id="stat-stations">16</div>
            <div class="metric-sub">Across 8 Primary Bengaluru Corridors</div>
          </div>
          <div class="metric-card card-hover-lift">
            <div class="metric-label">Monitored Dispensers</div>
            <div class="metric-value" id="stat-chargers">55+</div>
            <div class="metric-sub">CCS2, Type2, CHAdeMO & GB/T</div>
          </div>
          <div class="metric-card card-hover-lift">
            <div class="metric-label">Completed Sessions</div>
            <div class="metric-value" id="stat-sessions">2,250+</div>
            <div class="metric-sub">90-Day Trailing Volume</div>
          </div>
          <div class="metric-card card-hover-lift">
            <div class="metric-label">Grid Health Index</div>
            <div class="metric-value" style="color:var(--status-available);">99.8%</div>
            <div class="metric-sub">Single-Node Replica Set Active</div>
          </div>
        </div>
      </section>

      <!-- Bengaluru Corridor Highlights -->
      <section>
        <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:1rem;">Coverage Corridors</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem;">
          ${[
            { area: 'Whitefield', hubs: 2, power: 'Up to 120 kW', tag: 'Tech Corridor' },
            { area: 'Koramangala', hubs: 2, power: 'Up to 150 kW', tag: 'Urban Commercial' },
            { area: 'Indiranagar', hubs: 2, power: 'Up to 120 kW', tag: 'Central Transit' },
            { area: 'Electronic City', hubs: 2, power: 'Up to 150 kW', tag: 'Industrial Corridor' },
            { area: 'Hebbal', hubs: 2, power: 'Up to 150 kW', tag: 'North Gateway' },
            { area: 'HSR Layout', hubs: 2, power: 'Up to 120 kW', tag: 'South Corridor' },
            { area: 'Jayanagar', hubs: 2, power: 'Up to 120 kW', tag: 'Heritage Grid' },
            { area: 'Malleshwaram', hubs: 2, power: 'Up to 120 kW', tag: 'West Metro Corridor' },
          ]
            .map(
              c => `
            <div class="metric-card card-hover-lift" style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-weight:700; font-size:1.05rem;">${c.area}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${c.hubs} Stations • ${c.power}</div>
              </div>
              <span class="brand-sub">${c.tag}</span>
            </div>
          `
            )
            .join('')}
        </div>
      </section>
    `;

    // Fetch dynamic health status
    api
      .get('/health')
      .then(res => {
        if (res.database?.connected) {
          document.getElementById('metric-indicator')?.classList.add('status-ok');
        }
      })
      .catch(() => {});
  },
};
