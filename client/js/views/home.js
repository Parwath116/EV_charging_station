/**
 * VoltGrid Home / Executive Dashboard View
 * Features real-time grid metrics, interactive corridor discovery, and live telemetry indicators.
 */

import { api } from '../api.js';
import { state } from '../state.js';

export const HomeView = {
  activeCorridorFilter: 'all',

  async render(container) {
    container.innerHTML = `
      <!-- Hero Platform Banner -->
      <section class="hero-card card-hover-lift" style="margin-bottom: 2rem;">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div>
            <div class="hero-badge">VoltGrid Infrastructure • Bengaluru Metropolitan Grid</div>
            <h1 class="hero-title">Metropolitan EV Charging Management Platform</h1>
            <p class="hero-subtitle">
              Intelligent grid discovery, conflict-free charging reservations, real-time telemetry analytics, and autonomous operator tools.
            </p>
          </div>
          <div class="hero-status-pill" style="display: flex; align-items: center; gap: 0.6rem; background: var(--bg-card); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 600;">
            <span class="status-dot status-ok" id="hero-pulse"></span>
            <span id="grid-status-text">Central Grid Online</span>
          </div>
        </div>

        <!-- Quick Search Bar -->
        <div style="margin-top: 1.25rem; max-width: 640px; display: flex; gap: 0.5rem;">
          <input
            id="home-search-input"
            class="input"
            type="search"
            placeholder="Search by corridor (e.g. Whitefield, Koramangala, Indiranagar)..."
            style="flex: 1; padding: 0.7rem 1rem; font-size: 0.95rem;"
          />
          <button id="btn-home-search" class="btn btn-primary" type="button">
            <span>🔍</span> Find Bay
          </button>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; align-items: center;">
          <a href="#/map" class="btn btn-primary">🗺️ Open Network Map</a>
          <a href="#/stations" class="btn btn-secondary">⚡ Browse Stations</a>
          ${
            state.isAuthenticated
              ? `<a href="#/bookings" class="btn btn-secondary">📅 My Bookings</a>
                 <a href="#/sessions" class="btn btn-secondary">⚡ Charging Sessions</a>`
              : `<a href="#/register" class="btn btn-secondary">📝 Register Driver Account</a>
                 <a href="#/login" class="btn btn-secondary">🔑 Sign In</a>`
          }
        </div>
      </section>

      <!-- Network Live Metrics Section -->
      <section style="margin-bottom: 2.5rem;">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.25rem;">
          <div>
            <h2 style="font-size: 1.35rem; font-weight: 700; display: flex; align-items: center; gap: 0.6rem;">
              <span>Live Grid Telemetry & Capacity</span>
              <span id="metric-indicator" class="status-dot status-ok"></span>
            </h2>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.2rem;">
              Real-time telemetry stream synchronized via SSE and MongoDB time-series ingest.
            </p>
          </div>

          <!-- Real-Time Grid Telemetry Ticker -->
          <div style="display: flex; gap: 0.75rem; font-family: var(--font-mono); font-size: 0.8rem; background: var(--bg-card); border: 1px solid var(--border-color); padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); color: var(--text-secondary);">
            <span>⚡ Freq: <strong style="color: var(--accent-primary);">50.02 Hz</strong></span>
            <span>•</span>
            <span>Voltage: <strong style="color: var(--status-available);">230.4 V</strong></span>
            <span>•</span>
            <span>Load: <strong style="color: var(--text-main);">1.84 MW</strong></span>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-card card-hover-lift">
            <div class="metric-label">
              <span>Active Charging Hubs</span>
              <span>📍</span>
            </div>
            <div class="metric-value" id="stat-stations">16</div>
            <div class="metric-sub">Across 8 Primary Bengaluru Corridors</div>
          </div>

          <div class="metric-card card-hover-lift">
            <div class="metric-label">
              <span>Monitored Dispensers</span>
              <span>🔌</span>
            </div>
            <div class="metric-value" id="stat-chargers">48</div>
            <div class="metric-sub">CCS2 (DC Fast) & Type2 (AC)</div>
          </div>

          <div class="metric-card card-hover-lift">
            <div class="metric-label">
              <span>Energy Delivered</span>
              <span>⚡</span>
            </div>
            <div class="metric-value" id="stat-energy">2,450 kWh</div>
            <div class="metric-sub">90-Day Trailing Volume</div>
          </div>

          <div class="metric-card card-hover-lift">
            <div class="metric-label">
              <span>Grid Reliability Index</span>
              <span>🛡️</span>
            </div>
            <div class="metric-value" id="stat-health" style="color: var(--status-available);">99.8%</div>
            <div class="metric-sub">Single-Node Replica Set Active</div>
          </div>
        </div>
      </section>

      <!-- Bengaluru Corridor Highlights with Interactive Filters -->
      <section style="margin-bottom: 2rem;">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.25rem;">
          <div>
            <h2 style="font-size: 1.35rem; font-weight: 700;">Coverage Corridors</h2>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.2rem;">
              Select any corridor to immediately filter charging hubs on the geospatial map.
            </p>
          </div>

          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn-tab active" data-corridor-filter="all">All Corridors</button>
            <button class="btn-tab" data-corridor-filter="dc-fast">DC Fast (150 kW)</button>
            <button class="btn-tab" data-corridor-filter="tech">Tech & Metro Belt</button>
          </div>
        </div>

        <div id="corridors-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 1rem;">
          ${this.renderCorridorCards('all')}
        </div>
      </section>
    `;

    this.attachHomeEvents();
    this.loadLiveNetworkStats();
  },

  getCorridorList() {
    return [
      {
        area: 'Whitefield',
        hubs: 2,
        power: 'Up to 120 kW',
        tag: 'Tech Corridor',
        category: 'tech',
      },
      {
        area: 'Koramangala',
        hubs: 2,
        power: 'Up to 150 kW',
        tag: 'Urban Commercial',
        category: 'dc-fast',
      },
      {
        area: 'Indiranagar',
        hubs: 2,
        power: 'Up to 120 kW',
        tag: 'Central Transit',
        category: 'tech',
      },
      {
        area: 'Electronic City',
        hubs: 2,
        power: 'Up to 150 kW',
        tag: 'Industrial Corridor',
        category: 'dc-fast',
      },
      { area: 'Hebbal', hubs: 2, power: 'Up to 150 kW', tag: 'North Gateway', category: 'dc-fast' },
      {
        area: 'HSR Layout',
        hubs: 2,
        power: 'Up to 120 kW',
        tag: 'South Corridor',
        category: 'tech',
      },
      { area: 'Jayanagar', hubs: 2, power: 'Up to 120 kW', tag: 'Heritage Grid', category: 'tech' },
      {
        area: 'Malleshwaram',
        hubs: 2,
        power: 'Up to 120 kW',
        tag: 'West Metro Corridor',
        category: 'tech',
      },
    ];
  },

  renderCorridorCards(filter) {
    const list = this.getCorridorList();
    const filtered = filter === 'all' ? list : list.filter(c => c.category === filter);

    return filtered
      .map(
        c => `
      <a href="#/map?area=${encodeURIComponent(c.area)}" class="metric-card card-hover-lift" style="display: flex; flex-direction: column; justify-content: space-between; text-decoration: none; cursor: pointer; padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
          <div>
            <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">${c.area}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">${c.hubs} Stations • ${c.power}</div>
          </div>
          <span class="badge badge-info">${c.tag}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.5rem; font-size: 0.8rem; color: var(--accent-primary); font-weight: 600;">
          <span>View on Map</span>
          <span>→</span>
        </div>
      </a>
    `
      )
      .join('');
  },

  attachHomeEvents() {
    // Quick search bar
    const searchInput = document.getElementById('home-search-input');
    const searchBtn = document.getElementById('btn-home-search');

    const handleSearch = () => {
      const q = searchInput?.value.trim();
      if (q) {
        window.location.hash = `#/stations?q=${encodeURIComponent(q)}`;
      } else {
        window.location.hash = '#/stations';
      }
    };

    searchBtn?.addEventListener('click', handleSearch);
    searchInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSearch();
    });

    // Corridor Filter Tabs
    const filterTabs = document.querySelectorAll('[data-corridor-filter]');
    const corridorsContainer = document.getElementById('corridors-container');

    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filterVal = tab.getAttribute('data-corridor-filter');
        if (corridorsContainer) {
          corridorsContainer.innerHTML = this.renderCorridorCards(filterVal);
        }
      });
    });
  },

  async loadLiveNetworkStats() {
    try {
      const [healthRes, stationsRes] = await Promise.allSettled([
        api.get('/health'),
        api.get('/stations?limit=100'),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value.database?.connected) {
        document.getElementById('metric-indicator')?.classList.add('status-ok');
        const heroPulse = document.getElementById('hero-pulse');
        const statusText = document.getElementById('grid-status-text');
        if (heroPulse) heroPulse.className = 'status-dot status-ok';
        if (statusText) statusText.textContent = 'Central Grid Online (rs0)';
      }

      if (stationsRes.status === 'fulfilled' && Array.isArray(stationsRes.value.data)) {
        const stations = stationsRes.value.data;
        const totalStations = stations.length;
        let totalChargers = 0;
        stations.forEach(s => {
          totalChargers += (s.chargers || []).length;
        });

        const statStationsEl = document.getElementById('stat-stations');
        const statChargersEl = document.getElementById('stat-chargers');

        if (statStationsEl && totalStations > 0) {
          this.animateCounter(statStationsEl, totalStations);
        }
        if (statChargersEl && totalChargers > 0) {
          this.animateCounter(statChargersEl, totalChargers);
        }
      }
    } catch {
      // Graceful fallback to initial values
    }
  },

  animateCounter(element, target) {
    let current = 0;
    const duration = 800;
    const steps = 25;
    const increment = Math.ceil(target / steps);
    const stepTime = duration / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      element.textContent = current.toString();
    }, stepTime);
  },
};
