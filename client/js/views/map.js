/**
 * VoltGrid Interactive Geospatial Map View (Bengaluru Metropolitan Grid)
 * Powered by Leaflet & MongoDB 2dsphere / $geoNear / $geoWithin
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

// Bengaluru geographic boundaries
const BENGALURU_CENTER = [12.9716, 77.5946];
const BENGALURU_BOUNDS = [
  [12.75, 77.4],
  [13.2, 77.85],
];

export class MapView {
  constructor() {
    this.map = null;
    this.markersGroup = null;
    this.circleLayer = null;
    this.stations = [];
    this.activeFilter = {
      area: '',
      connector: '',
      status: '',
    };
    this.unsubscribeTheme = null;
  }

  async render(container, context = {}) {
    const query = context?.query || new URLSearchParams(window.location.hash.split('?')[1] || '');
    const preselectedArea = query.get('area') || '';
    if (preselectedArea) {
      this.activeFilter.area = preselectedArea;
    }

    container.innerHTML = `
      <div class="map-view-wrapper container" style="padding-top: var(--space-lg); padding-bottom: var(--space-xl);">
        <!-- Top Toolbar -->
        <div class="map-toolbar" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem;">Bengaluru Charging Grid</h1>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">
              Geospatial discovery with real-time status and sub-kilometer proximity lookup.
            </p>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
            <button id="btn-nearest-charger" class="btn btn-primary btn-sm" type="button">
              <span>📍</span> Find Nearest Charger
            </button>
            <button id="btn-circle-filter" class="btn btn-secondary btn-sm" type="button">
              <span>⭕</span> 5km Radius Filter
            </button>
            <button id="btn-reset-map" class="btn btn-secondary btn-sm" type="button">
              <span>↺</span> Reset View
            </button>
            ${
              state.hasRole('operator', 'admin')
                ? `<button id="btn-add-station-map" class="btn btn-secondary btn-sm" type="button" style="border-color: var(--accent-primary);">
                    <span>➕</span> Add Station
                  </button>`
                : ''
            }
          </div>
        </div>

        <!-- Filter Controls Bar -->
        <div class="card" style="padding: 0.75rem 1rem; margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label for="filter-area" style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Area:</label>
            <select id="filter-area" class="input" style="padding: 0.35rem 0.6rem; font-size: 0.85rem;">
              <option value="">All Areas</option>
              <option value="Whitefield">Whitefield</option>
              <option value="Koramangala">Koramangala</option>
              <option value="Indiranagar">Indiranagar</option>
              <option value="HSR Layout">HSR Layout</option>
              <option value="Electronic City">Electronic City</option>
              <option value="Jayanagar">Jayanagar</option>
              <option value="Hebbal">Hebbal</option>
              <option value="Malleshwaram">Malleshwaram</option>
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label for="filter-connector" style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Connector:</label>
            <select id="filter-connector" class="input" style="padding: 0.35rem 0.6rem; font-size: 0.85rem;">
              <option value="">All Connectors</option>
              <option value="CCS2">CCS2 (DC Fast)</option>
              <option value="Type2">Type2 (AC)</option>
              <option value="CHAdeMO">CHAdeMO (DC)</option>
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label for="filter-status" style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Status:</label>
            <select id="filter-status" class="input" style="padding: 0.35rem 0.6rem; font-size: 0.85rem;">
              <option value="">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <div style="margin-left: auto; display: flex; align-items: center; gap: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
            <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: var(--status-available);"></span> Active
            </span>
            <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: var(--status-maintenance);"></span> Maintenance
            </span>
            <span id="map-station-count" style="font-weight: 600; color: var(--accent-primary);">Loading stations...</span>
          </div>
        </div>

        <!-- Map Container -->
        <div id="leaflet-map" style="height: 600px; width: 100%; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-color); position: relative; box-shadow: var(--shadow-md);"></div>
      </div>
    `;

    await this.ensureLeafletLoaded();
    this.initLeaflet();
    this.attachEvents();
    await this.loadStations();

    // Toggle dark mode CSS filter on map container upon theme change
    this.unsubscribeTheme = state.subscribe(st => {
      this.updateMapTheme(st.theme);
    });

    // Real-time station marker update via SSE
    this.handleStationUpdate = e => {
      const update = e.detail;
      if (!update || !update.stationId) return;
      const idx = this.stations.findIndex(s => String(s._id) === String(update.stationId));
      if (idx !== -1) {
        if (update.status) this.stations[idx].status = update.status;
        if (update.chargers) this.stations[idx].chargers = update.chargers;
        this.renderMarkers(this.stations);
      }
    };
    window.addEventListener('voltgrid:station_updated', this.handleStationUpdate);
  }

  async ensureLeafletLoaded() {
    if (window.L) return true;

    // Verify Leaflet CSS is present
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/vendor/leaflet/leaflet.css';
      document.head.appendChild(link);
    }

    // Verify Leaflet JS is present
    if (!document.querySelector('script[src*="leaflet"]')) {
      const script = document.createElement('script');
      script.src = '/vendor/leaflet/leaflet.js';
      document.head.appendChild(script);
    }

    return new Promise(resolve => {
      let count = 0;
      const interval = setInterval(() => {
        count++;
        if (window.L) {
          clearInterval(interval);
          resolve(true);
        } else if (count === 15 && !window.L) {
          // Attempt alternate CDN fallback
          const fallback = document.createElement('script');
          fallback.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
          document.head.appendChild(fallback);
        } else if (count > 40) {
          clearInterval(interval);
          resolve(Boolean(window.L));
        }
      }, 100);
    });
  }

  initLeaflet() {
    if (!window.L) {
      toast.error('Map library failed to load. Please refresh the page.');
      return;
    }

    const containerEl = document.getElementById('leaflet-map');
    if (!containerEl) return;

    // Safely cleanup any previous Leaflet instance on this container
    if (this.map) {
      try {
        this.map.remove();
      } catch {
        // ignore cleanup error
      }
      this.map = null;
    }
    if (containerEl._leaflet_id) {
      delete containerEl._leaflet_id;
    }

    // Initialize Leaflet Map centered on Bengaluru
    this.map = window.L.map(containerEl, {
      center: BENGALURU_CENTER,
      zoom: 12,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: BENGALURU_BOUNDS,
    });

    // Invalidate size immediately and after layout pass
    this.map.invalidateSize();
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 200);

    // Single OpenStreetMap tile layer (no API key required)
    this.tileLayer = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.updateMapTheme(state.theme);

    // Markers layer group
    this.markersGroup = window.L.layerGroup().addTo(this.map);

    // Map Click Listener
    this.map.on('click', e => {
      const { lat, lng } = e.latlng;
      if (state.hasRole('operator', 'admin')) {
        this.openCreateStationModal(lat, lng);
      } else {
        // Drop click marker and prompt circle filter
        this.applyRadiusFilter(lat, lng, 5000);
      }
    });
  }

  updateMapTheme(currentTheme) {
    const containerEl = document.getElementById('leaflet-map');
    if (containerEl) {
      containerEl.classList.toggle('map-dark-theme', currentTheme === 'dark');
    }
  }

  updateTileLayer(currentTheme) {
    this.updateMapTheme(currentTheme);
  }

  createCustomIcon(status) {
    const color =
      status === 'active' ? '#10b981' : status === 'maintenance' ? '#ec4899' : '#ef4444';

    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
        </filter>
        <path fill="${color}" filter="url(#shadow)" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="3.5" fill="#ffffff"/>
        <path d="M12 6.5 L10.5 9.5 L12 9.5 L11.5 12 L13.5 9 L12 9 Z" fill="${color}"/>
      </svg>
    `;

    return window.L.divIcon({
      className: 'voltgrid-map-pin',
      html: svgIcon,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });
  }

  async loadStations() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (this.activeFilter.area) params.set('area', this.activeFilter.area);
      if (this.activeFilter.connector) params.set('connector', this.activeFilter.connector);
      if (this.activeFilter.status) params.set('status', this.activeFilter.status);

      const res = await api.get(`/stations?${params.toString()}`);
      this.stations = res.data || [];
      this.renderMarkers(this.stations);
    } catch (err) {
      toast.error('Failed to load charging stations: ' + err.message);
    }
  }

  renderMarkers(stationsList) {
    if (!this.markersGroup) return;
    this.markersGroup.clearLayers();

    const countEl = document.getElementById('map-station-count');
    if (countEl) {
      countEl.textContent = `${stationsList.length} Station(s) Visible`;
    }

    stationsList.forEach(st => {
      const [lng, lat] = st.location.coordinates;
      const marker = window.L.marker([lat, lng], {
        icon: this.createCustomIcon(st.status),
      });

      const availableCount = (st.chargers || []).filter(c => c.status === 'available').length;
      const totalCount = (st.chargers || []).length;
      const connectors = [...new Set((st.chargers || []).map(c => c.connector))].join(', ');

      const popupHtml = `
        <div style="min-width: 220px; font-family: inherit;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.35rem;">
            <h4 style="font-size: 1rem; font-weight: 700; margin: 0; color: var(--text-main);">${st.name}</h4>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 0.5rem 0;">${st.address}</p>

          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.8rem;">
            <span class="badge ${st.status === 'active' ? 'badge-success' : 'badge-warning'}">${st.status.toUpperCase()}</span>
            <span class="badge badge-info">₹${st.tariffPerKWh}/kWh</span>
          </div>

          <div style="font-size: 0.82rem; margin-bottom: 0.75rem; background: var(--bg-surface); padding: 0.4rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div><strong>Available:</strong> ${availableCount} of ${totalCount} bays</div>
            <div><strong>Connectors:</strong> ${connectors}</div>
          </div>

          <div style="display: flex; gap: 0.35rem;">
            <a href="#/bookings?stationId=${st._id}" class="btn btn-primary btn-sm btn-popup-reserve" style="flex: 1; text-align: center; text-decoration: none;">Reserve</a>
            <a href="#/sessions?stationId=${st._id}" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center; text-decoration: none;">Charge</a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      this.markersGroup.addLayer(marker);
    });

    // Auto-fit to filtered markers if area filter is active
    if (this.activeFilter.area && stationsList.length > 0 && this.map) {
      setTimeout(() => {
        if (!this.map || !this.markersGroup) return;
        const layers = this.markersGroup.getLayers();
        if (layers.length > 0) {
          const group = window.L.featureGroup(layers);
          if (group.getBounds().isValid()) {
            this.map.fitBounds(group.getBounds().pad(0.3));
          }
        }
      }, 150);
    }
  }

  attachEvents() {
    // Set initial filter dropdown values
    const filterAreaEl = document.getElementById('filter-area');
    if (filterAreaEl && this.activeFilter.area) {
      filterAreaEl.value = this.activeFilter.area;
    }

    // Area Filter
    filterAreaEl?.addEventListener('change', e => {
      this.activeFilter.area = e.target.value;
      this.loadStations();
    });

    // Connector Filter
    document.getElementById('filter-connector')?.addEventListener('change', e => {
      this.activeFilter.connector = e.target.value;
      this.loadStations();
    });

    // Status Filter
    document.getElementById('filter-status')?.addEventListener('change', e => {
      this.activeFilter.status = e.target.value;
      this.loadStations();
    });

    // Reset View
    document.getElementById('btn-reset-map')?.addEventListener('click', () => {
      if (this.circleLayer) {
        this.map.removeLayer(this.circleLayer);
        this.circleLayer = null;
      }
      this.activeFilter = { area: '', connector: '', status: '' };
      document.getElementById('filter-area').value = '';
      document.getElementById('filter-connector').value = '';
      document.getElementById('filter-status').value = '';
      this.map.setView(BENGALURU_CENTER, 12);
      this.loadStations();
    });

    // Find Nearest Charger via $geoNear
    document.getElementById('btn-nearest-charger')?.addEventListener('click', () => {
      this.findNearestCharger();
    });

    // Circle Radius Filter via $geoWithin
    document.getElementById('btn-circle-filter')?.addEventListener('click', () => {
      const center = this.map.getCenter();
      this.applyRadiusFilter(center.lat, center.lng, 5000);
    });

    // Operator Add Station button
    document.getElementById('btn-add-station-map')?.addEventListener('click', () => {
      const center = this.map.getCenter();
      this.openCreateStationModal(center.lat, center.lng);
    });
  }

  async findNearestCharger() {
    toast.info('Calculating nearest operational charger via $geoNear...');

    const searchNear = async (lng, lat) => {
      try {
        const res = await api.get(
          `/stations/nearest?lng=${lng}&lat=${lat}&maxDistance=20000&limit=5&onlyAvailable=true`
        );
        const nearestList = res.data || [];

        if (nearestList.length === 0) {
          toast.warning('No available charging stations found within 20km.');
          return;
        }

        const topStation = nearestList[0];
        const [stLng, stLat] = topStation.location.coordinates;
        const distKm = (topStation.distanceMeters / 1000).toFixed(1);

        this.renderMarkers(nearestList);
        this.map.setView([stLat, stLng], 14);

        // Draw temporary beacon marker
        const beacon = window.L.circleMarker([lat, lng], {
          radius: 8,
          color: '#06b6d4',
          fillColor: '#06b6d4',
          fillOpacity: 0.8,
        }).addTo(this.map);
        beacon
          .bindPopup(`<strong>Your Lookup Point</strong><br>Nearest charger is ${distKm} km away.`)
          .openPopup();

        toast.success(`Nearest station: ${topStation.name} (${distKm} km)`);
      } catch (err) {
        toast.error('Proximity search failed: ' + err.message);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          searchNear(pos.coords.longitude, pos.coords.latitude);
        },
        () => {
          // Fallback to central Bengaluru
          toast.info('Using central Bengaluru coordinate anchor.');
          searchNear(BENGALURU_CENTER[1], BENGALURU_CENTER[0]);
        },
        { timeout: 5000 }
      );
    } else {
      searchNear(BENGALURU_CENTER[1], BENGALURU_CENTER[0]);
    }
  }

  async applyRadiusFilter(lat, lng, radiusMeters = 5000) {
    if (this.circleLayer) {
      this.map.removeLayer(this.circleLayer);
    }

    this.circleLayer = window.L.circle([lat, lng], {
      radius: radiusMeters,
      color: '#06b6d4',
      fillColor: '#06b6d4',
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(this.map);

    try {
      const radiusKm = radiusMeters / 1000;
      const res = await api.get(
        `/stations/within-circle?lng=${lng}&lat=${lat}&radiusKm=${radiusKm}`
      );
      const stations = res.data || [];
      this.renderMarkers(stations);
      toast.info(`Found ${stations.length} station(s) within ${radiusKm}km radius.`);
    } catch (err) {
      toast.error('Radius filter failed: ' + err.message);
    }
  }

  openCreateStationModal(lat, lng) {
    const modalContent = `
      <form id="modal-form-station" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="new-st-name">Station Name *</label>
          <input class="input" id="new-st-name" type="text" required placeholder="VoltGrid Superhub - Indiranagar" />
        </div>

        <div class="form-group">
          <label class="form-label" for="new-st-operator">Operator *</label>
          <input class="input" id="new-st-operator" type="text" required value="VoltGrid Metropolitan Operations" />
        </div>

        <div class="form-group">
          <label class="form-label" for="new-st-address">Address *</label>
          <input class="input" id="new-st-address" type="text" required placeholder="100 Feet Rd, Indiranagar" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="new-st-area">Area *</label>
            <select class="input" id="new-st-area" required>
              <option value="Whitefield">Whitefield</option>
              <option value="Koramangala">Koramangala</option>
              <option value="Indiranagar" selected>Indiranagar</option>
              <option value="HSR Layout">HSR Layout</option>
              <option value="Electronic City">Electronic City</option>
              <option value="Jayanagar">Jayanagar</option>
              <option value="Hebbal">Hebbal</option>
              <option value="Malleshwaram">Malleshwaram</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="new-st-tariff">Tariff (₹/kWh) *</label>
            <input class="input" id="new-st-tariff" type="number" step="0.5" required value="17.0" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="new-st-lng">Longitude *</label>
            <input class="input" id="new-st-lng" type="number" step="0.0001" required value="${lng.toFixed(4)}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="new-st-lat">Latitude *</label>
            <input class="input" id="new-st-lat" type="number" step="0.0001" required value="${lat.toFixed(4)}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Default Chargers</label>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
            Will initialize with 2x CCS2 (120kW) and 1x Type2 (22kW) chargers.
          </p>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Deploy Station</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Deploy New Charging Station',
      content: modalContent,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('modal-form-station')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const payload = {
          name: document.getElementById('new-st-name').value,
          operator: document.getElementById('new-st-operator').value,
          address: document.getElementById('new-st-address').value,
          area: document.getElementById('new-st-area').value,
          tariffPerKWh: parseFloat(document.getElementById('new-st-tariff').value),
          location: {
            type: 'Point',
            coordinates: [
              parseFloat(document.getElementById('new-st-lng').value),
              parseFloat(document.getElementById('new-st-lat').value),
            ],
          },
          status: 'active',
          chargers: [
            {
              chargerId: `CHG-${Date.now().toString().slice(-6)}-01`,
              connector: 'CCS2',
              powerKW: 120,
              status: 'available',
            },
            {
              chargerId: `CHG-${Date.now().toString().slice(-6)}-02`,
              connector: 'CCS2',
              powerKW: 120,
              status: 'available',
            },
            {
              chargerId: `CHG-${Date.now().toString().slice(-6)}-03`,
              connector: 'Type2',
              powerKW: 22,
              status: 'available',
            },
          ],
        };

        const res = await api.post('/stations', payload);
        toast.success(`Station "${res.data.name}" deployed successfully!`);
        modal.close();
        this.loadStations();
      } catch (err) {
        toast.error('Failed to create station: ' + err.message);
      }
    });
  }

  destroy() {
    if (this.handleStationUpdate) {
      window.removeEventListener('voltgrid:station_updated', this.handleStationUpdate);
      this.handleStationUpdate = null;
    }
    if (this.unsubscribeTheme) {
      this.unsubscribeTheme();
      this.unsubscribeTheme = null;
    }
    if (this.map) {
      try {
        this.map.remove();
      } catch {
        // ignore
      }
      this.map = null;
    }
  }
}
