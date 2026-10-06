/**
 * VoltGrid Station Directory & Fleet Management View
 * Features text search, multi-faceted filtering, tariff updates, bulk CSV import, and cascade deletion.
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

export class StationsView {
  constructor() {
    this.stations = [];
    this.pagination = { page: 1, limit: 12, total: 0 };
    this.filters = {
      q: '',
      area: '',
      connector: '',
      status: '',
    };
    this.sort = 'createdAt:-1';
  }

  async render(container) {
    container.innerHTML = `
      <div class="stations-view-wrapper container" style="padding-top: var(--space-lg); padding-bottom: var(--space-2xl);">
        <!-- Header -->
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem;">Charging Station Directory</h1>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">
              Browse, search, and manage metropolitan EV infrastructure across Bengaluru.
            </p>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
            <a href="#/map" class="btn btn-secondary btn-sm">
              <span>🗺️</span> Switch to Map
            </a>
            ${
              state.hasRole('operator')
                ? `<button id="btn-create-station" class="btn btn-primary btn-sm" type="button">
                    <span>➕</span> Add Station
                  </button>`
                : ''
            }
            ${
              state.hasRole('admin')
                ? `<button id="btn-bulk-import" class="btn btn-secondary btn-sm" type="button" style="border-color: var(--accent-primary);">
                    <span>📥</span> CSV Bulk Import
                  </button>`
                : ''
            }
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="card" style="padding: 1rem; margin-bottom: 1.5rem;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 0.75rem; align-items: end;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="search-input" style="font-size: 0.8rem;">
                Search Stations <kbd style="font-size: 0.7rem; padding: 0.1rem 0.3rem;">/</kbd>
              </label>
              <input
                id="search-input"
                class="input"
                type="search"
                placeholder="Search by name, address, or amenities..."
                value="${this.filters.q}"
              />
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="select-area" style="font-size: 0.8rem;">Area</label>
              <select id="select-area" class="input">
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

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="select-connector" style="font-size: 0.8rem;">Connector</label>
              <select id="select-connector" class="input">
                <option value="">All Connectors</option>
                <option value="CCS2">CCS2 (DC Fast)</option>
                <option value="Type2">Type2 (AC)</option>
                <option value="CHAdeMO">CHAdeMO (DC)</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="select-status" style="font-size: 0.8rem;">Status</label>
              <select id="select-status" class="input">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <button id="btn-apply-filters" class="btn btn-primary" type="button" style="width: 100%;">Filter</button>
            </div>
          </div>
        </div>

        <!-- Station Grid Container -->
        <div id="stations-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
          <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-secondary);">
            Loading charging stations...
          </div>
        </div>

        <!-- Pagination Bar -->
        <div id="pagination-controls" style="display: flex; justify-content: space-between; align-items: center;"></div>
      </div>
    `;

    this.attachEvents();
    await this.fetchStations();
  }

  attachEvents() {
    // Quick search hotkey
    const searchInput = document.getElementById('search-input');
    document.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput?.focus();
      }
    });

    // Search input debounced
    let debounceTimer;
    searchInput?.addEventListener('input', e => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.filters.q = e.target.value.trim();
        this.pagination.page = 1;
        this.fetchStations();
      }, 350);
    });

    // Apply Filter button
    document.getElementById('btn-apply-filters')?.addEventListener('click', () => {
      this.filters.area = document.getElementById('select-area').value;
      this.filters.connector = document.getElementById('select-connector').value;
      this.filters.status = document.getElementById('select-status').value;
      this.pagination.page = 1;
      this.fetchStations();
    });

    // Admin / Operator Buttons
    document.getElementById('btn-create-station')?.addEventListener('click', () => {
      this.openCreateModal();
    });

    document.getElementById('btn-bulk-import')?.addEventListener('click', () => {
      this.openBulkImportModal();
    });
  }

  async fetchStations() {
    try {
      const params = new URLSearchParams({
        page: this.pagination.page.toString(),
        limit: this.pagination.limit.toString(),
      });

      if (this.filters.q) params.set('q', this.filters.q);
      if (this.filters.area) params.set('area', this.filters.area);
      if (this.filters.connector) params.set('connector', this.filters.connector);
      if (this.filters.status) params.set('status', this.filters.status);

      const res = await api.get(`/stations?${params.toString()}`);
      this.stations = res.data || [];
      this.pagination.total = res.pagination?.total || 0;

      this.renderGrid();
      this.renderPagination();
    } catch (err) {
      toast.error('Failed to load stations: ' + err.message);
    }
  }

  renderGrid() {
    const grid = document.getElementById('stations-grid');
    if (!grid) return;

    if (this.stations.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
          <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">No charging stations found</h3>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">Try adjusting your query, area filters, or connector criteria.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.stations
      .map(st => {
        const availableCount = (st.chargers || []).filter(c => c.status === 'available').length;
        const totalCount = (st.chargers || []).length;
        const statusBadge =
          st.status === 'active'
            ? '<span class="badge badge-success">ACTIVE</span>'
            : st.status === 'maintenance'
              ? '<span class="badge badge-warning">MAINTENANCE</span>'
              : '<span class="badge badge-danger">DECOMMISSIONED</span>';

        return `
          <div class="card station-card" style="display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-md); overflow: hidden; transition: transform var(--transition-fast), box-shadow var(--transition-fast);">
            <div style="padding: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem; gap: 0.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0; color: var(--text-main);">${st.name}</h3>
                ${statusBadge}
              </div>

              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                <div>📍 ${st.area} • ${st.address}</div>
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.25rem;">Operator: ${st.operator}</div>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); margin-bottom: 0.75rem; border: 1px solid var(--border-color);">
                <div>
                  <span style="font-size: 0.8rem; color: var(--text-secondary);">Tariff:</span>
                  <strong style="color: var(--accent-primary); font-size: 0.95rem;"> ₹${st.tariffPerKWh}/kWh</strong>
                </div>
                <div>
                  <span style="font-size: 0.8rem; color: var(--text-secondary);">Available:</span>
                  <strong style="color: var(--status-available); font-size: 0.95rem;"> ${availableCount}/${totalCount}</strong>
                </div>
              </div>

              <!-- Chargers List -->
              <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem;">
                ${(st.chargers || [])
                  .map(
                    c => `
                  <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); background: var(--bg-base); border: 1px solid var(--border-color); display: inline-flex; align-items: center; gap: 0.25rem;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${c.status === 'available' ? 'var(--status-available)' : 'var(--text-muted)'};"></span>
                    ${c.connector} (${c.powerKW}kW)
                  </span>
                `
                  )
                  .join('')}
              </div>
            </div>

            <!-- Footer Action Row -->
            <div style="padding: 0.75rem 1.25rem; background: var(--bg-surface); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
              <div style="display: flex; gap: 0.35rem;">
                <a href="#/bookings?stationId=${st._id}" class="btn btn-primary btn-sm">Reserve</a>
                <a href="#/sessions?stationId=${st._id}" class="btn btn-secondary btn-sm">Charge</a>
              </div>

              ${
                state.hasRole('operator')
                  ? `
                <div style="display: flex; gap: 0.25rem;">
                  <button class="btn btn-secondary btn-sm btn-edit-tariff" data-id="${st._id}" data-tariff="${st.tariffPerKWh}" title="Edit Tariff">₹</button>
                  <button class="btn btn-secondary btn-sm btn-toggle-status" data-id="${st._id}" data-status="${st.status}" title="Toggle Maintenance">⚙️</button>
                  ${
                    state.hasRole('admin')
                      ? `<button class="btn btn-danger btn-sm btn-delete-station" data-id="${st._id}" data-name="${st.name}" title="Delete Station">🗑️</button>`
                      : ''
                  }
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    this.bindCardActions();
  }

  bindCardActions() {
    // Edit Tariff
    document.querySelectorAll('.btn-edit-tariff').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentTariff = btn.dataset.tariff;
        this.openEditTariffModal(id, currentTariff);
      });
    });

    // Toggle Maintenance Status
    document.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const current = btn.dataset.status;
        const nextStatus = current === 'active' ? 'maintenance' : 'active';
        try {
          await api.patch(`/stations/${id}/status`, { status: nextStatus });
          toast.success(`Station status updated to ${nextStatus.toUpperCase()}`);
          this.fetchStations();
        } catch (err) {
          toast.error('Failed to update status: ' + err.message);
        }
      });
    });

    // Admin Hard Delete with cascade guard
    document.querySelectorAll('.btn-delete-station').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        this.openDeleteConfirmModal(id, name);
      });
    });
  }

  renderPagination() {
    const container = document.getElementById('pagination-controls');
    if (!container) return;

    const totalPages = Math.ceil(this.pagination.total / this.pagination.limit) || 1;
    container.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        Showing <strong>${this.stations.length}</strong> of <strong>${this.pagination.total}</strong> stations (Page ${this.pagination.page} of ${totalPages})
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button id="btn-page-prev" class="btn btn-secondary btn-sm" ${this.pagination.page <= 1 ? 'disabled' : ''}>Previous</button>
        <button id="btn-page-next" class="btn btn-secondary btn-sm" ${this.pagination.page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    document.getElementById('btn-page-prev')?.addEventListener('click', () => {
      if (this.pagination.page > 1) {
        this.pagination.page--;
        this.fetchStations();
      }
    });

    document.getElementById('btn-page-next')?.addEventListener('click', () => {
      if (this.pagination.page < totalPages) {
        this.pagination.page++;
        this.fetchStations();
      }
    });
  }

  openEditTariffModal(stationId, currentTariff) {
    const content = `
      <form id="form-edit-tariff" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="input-tariff-val">Tariff Rate (₹ per kWh) *</label>
          <input class="input" id="input-tariff-val" type="number" step="0.25" min="5" max="100" required value="${currentTariff}" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Tariff</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Update Station Tariff',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('form-edit-tariff')?.addEventListener('submit', async e => {
      e.preventDefault();
      const newTariff = parseFloat(document.getElementById('input-tariff-val').value);
      try {
        await api.patch(`/stations/${stationId}/tariff`, { tariffPerKWh: newTariff });
        toast.success(`Tariff successfully updated to ₹${newTariff}/kWh`);
        modal.close();
        this.fetchStations();
      } catch (err) {
        toast.error('Failed to update tariff: ' + err.message);
      }
    });
  }

  openDeleteConfirmModal(stationId, stationName) {
    const content = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <p style="color: var(--text-main); font-size: 0.95rem;">
          Are you sure you want to hard-delete <strong>"${stationName}"</strong>?
        </p>
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--status-faulted); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; color: var(--text-secondary);">
          <strong>Cascade Guard:</strong> The database transaction will automatically verify whether active reservations exist. If active reservations exist, deletion will be blocked and you will be advised to decommission instead.
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button id="btn-confirm-delete" type="button" class="btn btn-danger">Execute Transactional Delete</button>
        </div>
      </div>
    `;

    modal.open({
      title: 'Confirm Station Hard Deletion',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
      try {
        await api.delete(`/stations/${stationId}`);
        toast.success(`Station "${stationName}" successfully removed.`);
        modal.close();
        this.fetchStations();
      } catch (err) {
        toast.error(err.message || 'Deletion rejected by cascade policy.');
      }
    });
  }

  openCreateModal() {
    const content = `
      <form id="modal-form-station-create" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="add-st-name">Station Name *</label>
          <input class="input" id="add-st-name" type="text" required placeholder="VoltGrid Superhub - Outer Ring Rd" />
        </div>

        <div class="form-group">
          <label class="form-label" for="add-st-operator">Operator *</label>
          <input class="input" id="add-st-operator" type="text" required value="VoltGrid Metropolitan Operations" />
        </div>

        <div class="form-group">
          <label class="form-label" for="add-st-address">Address *</label>
          <input class="input" id="add-st-address" type="text" required placeholder="Kadubeesanahalli, Marathahalli Outer Ring Rd" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="add-st-area">Area *</label>
            <select class="input" id="add-st-area" required>
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
          <div class="form-group">
            <label class="form-label" for="add-st-tariff">Tariff (₹/kWh) *</label>
            <input class="input" id="add-st-tariff" type="number" step="0.5" required value="17.5" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="add-st-lng">Longitude (Bengaluru: 77.40 - 77.85) *</label>
            <input class="input" id="add-st-lng" type="number" step="0.0001" required value="77.6850" />
          </div>
          <div class="form-group">
            <label class="form-label" for="add-st-lat">Latitude (Bengaluru: 12.75 - 13.20) *</label>
            <input class="input" id="add-st-lat" type="number" step="0.0001" required value="12.9350" />
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Deploy Station</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Deploy New Station',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('modal-form-station-create')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const payload = {
          name: document.getElementById('add-st-name').value,
          operator: document.getElementById('add-st-operator').value,
          address: document.getElementById('add-st-address').value,
          area: document.getElementById('add-st-area').value,
          tariffPerKWh: parseFloat(document.getElementById('add-st-tariff').value),
          location: {
            type: 'Point',
            coordinates: [
              parseFloat(document.getElementById('add-st-lng').value),
              parseFloat(document.getElementById('add-st-lat').value),
            ],
          },
          status: 'active',
          chargers: [
            {
              chargerId: `CHG-${Date.now().toString().slice(-6)}-A`,
              connector: 'CCS2',
              powerKW: 120,
              status: 'available',
            },
            {
              chargerId: `CHG-${Date.now().toString().slice(-6)}-B`,
              connector: 'Type2',
              powerKW: 22,
              status: 'available',
            },
          ],
        };

        await api.post('/stations', payload);
        toast.success('Station successfully deployed!');
        modal.close();
        this.fetchStations();
      } catch (err) {
        toast.error('Creation failed: ' + err.message);
      }
    });
  }

  openBulkImportModal() {
    const sampleCsv = `name,address,area,lng,lat,tariffPerKWh,connectors
VoltGrid Express Hub A,Ring Road Near Intel,Bellandur,77.6812,12.9284,16.5,CCS2|Type2
VoltGrid Express Hub B,Sarjapur Main Road,HSR Layout,77.6489,12.9156,17.0,CCS2|CHAdeMO`;

    const content = `
      <form id="form-bulk-import" style="display: flex; flex-direction: column; gap: 1rem;">
        <p style="font-size: 0.85rem; color: var(--text-secondary);">
          Paste CSV records formatted as shown below. All stations will be validated against Bengaluru metropolitan coordinates before batch insertion.
        </p>

        <div class="form-group">
          <label class="form-label" for="csv-text">CSV Payload *</label>
          <textarea id="csv-text" class="input" style="height: 160px; font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.4;">${sampleCsv}</textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Process Bulk Import</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Bulk Station Import (CSV)',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('form-bulk-import')?.addEventListener('submit', async e => {
      e.preventDefault();
      const csv = document.getElementById('csv-text').value.trim();
      try {
        const res = await api.post('/stations/bulk-import', { csv });
        toast.success(res.message || 'Stations successfully imported!');
        modal.close();
        this.fetchStations();
      } catch (err) {
        toast.error('Import failed: ' + err.message);
      }
    });
  }

  destroy() {}
}
