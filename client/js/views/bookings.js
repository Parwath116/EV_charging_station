/**
 * VoltGrid Reservations & Slot Booking View
 * Concurrency-safe reservations, live cost & charging duration estimator, reschedule & cancellation.
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

export class BookingsView {
  constructor() {
    this.bookings = [];
    this.stations = [];
    this.selectedStationId = '';
    this.estimation = null;
  }

  async render(container) {
    if (!state.isAuthenticated) {
      container.innerHTML = `
        <div class="container" style="padding-top: var(--space-2xl); text-align: center;">
          <div class="card" style="max-width: 520px; margin: 0 auto; padding: 2.5rem 2rem; border-radius: var(--radius-lg);">
            <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📅</div>
            <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem;">Authentication Required</h2>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.95rem; line-height: 1.6;">
              Please sign in to view your charging reservations and reserve charger slots.
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
              <button id="btn-quick-login-driver" class="btn btn-primary" type="button">
                ⚡ Quick Sign In as Demo Driver
              </button>
              <a href="#/login?redirect=bookings" class="btn btn-secondary">
                Sign In Manually
              </a>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btn-quick-login-driver')?.addEventListener('click', async () => {
        try {
          const res = await api.post('/auth/login', {
            email: 'driver.aarav.mehta.1@voltgrid.internal',
            password: 'VoltGrid#2026',
          });
          if (res.data?.token) {
            state.setAuth(res.data.token, res.data.user);
            toast.success('Signed in as demo driver!');
            this.render(container);
          }
        } catch (err) {
          toast.error('Quick login failed: ' + err.message);
        }
      });
      return;
    }

    // Check URL search params for preselected stationId
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
    this.selectedStationId = urlParams.get('stationId') || '';

    container.innerHTML = `
      <div class="bookings-view-wrapper container" style="padding-top: var(--space-lg); padding-bottom: var(--space-2xl);">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem;">Slot Reservations</h1>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">
              Guaranteed slot reservations backed by ACID concurrency conflict enforcement.
            </p>
          </div>
          <button id="btn-open-booking-modal" class="btn btn-primary btn-sm">
            <span>➕</span> Reserve New Slot
          </button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 340px; gap: 1.5rem; align-items: start;">
          <!-- Bookings History List -->
          <div>
            <div class="card" style="padding: 1.25rem;">
              <h2 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 1rem;">Your Reservations</h2>
              <div id="bookings-list-container">
                <p style="color: var(--text-secondary); font-size: 0.9rem;">Loading bookings...</p>
              </div>
            </div>
          </div>

          <!-- Cost & Time Estimator Widget -->
          <div>
            <div class="card" style="padding: 1.25rem; border-color: var(--accent-primary);">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                <span style="font-size: 1.2rem;">⚡</span>
                <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Charging Estimator</h3>
              </div>
              <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1rem;">
                Simulate energy requirements, estimated cost, and charge time based on station tariffs.
              </p>

              <form id="form-estimator" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <div class="form-group">
                  <label class="form-label" for="est-station" style="font-size: 0.8rem;">Select Station</label>
                  <select id="est-station" class="input" style="font-size: 0.85rem;" required>
                    <option value="">Choose Station...</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="est-battery" style="font-size: 0.8rem;">Battery Capacity (kWh)</label>
                  <input id="est-battery" class="input" type="number" min="10" max="150" value="40.5" required />
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                  <div class="form-group">
                    <label class="form-label" for="est-cur-soc" style="font-size: 0.8rem;">Start SoC (%)</label>
                    <input id="est-cur-soc" class="input" type="number" min="0" max="95" value="20" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="est-tgt-soc" style="font-size: 0.8rem;">Target SoC (%)</label>
                    <input id="est-tgt-soc" class="input" type="number" min="5" max="100" value="80" required />
                  </div>
                </div>

                <button type="submit" class="btn btn-secondary btn-sm" style="width: 100%; margin-top: 0.25rem;">
                  Calculate Estimate
                </button>
              </form>

              <!-- Estimation Results Output -->
              <div id="est-results-output" style="margin-top: 1rem; display: none; background: var(--bg-surface); padding: 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                  <span style="color: var(--text-secondary);">Energy Needed:</span>
                  <strong id="est-out-energy" style="color: var(--text-main);">0 kWh</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                  <span style="color: var(--text-secondary);">Estimated Cost:</span>
                  <strong id="est-out-cost" style="color: var(--accent-primary);">₹0.00</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--text-secondary);">Approx. Time:</span>
                  <strong id="est-out-time" style="color: var(--status-available);">0 mins</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    await this.loadStations();
    await this.loadBookings();
    this.attachEvents();
  }

  async loadStations() {
    try {
      const res = await api.get('/stations?limit=50&status=active');
      this.stations = res.data || [];

      const select = document.getElementById('est-station');
      if (select) {
        select.innerHTML =
          '<option value="">Choose Station...</option>' +
          this.stations
            .map(
              s =>
                `<option value="${s._id}" ${s._id === this.selectedStationId ? 'selected' : ''}>${s.name} (₹${s.tariffPerKWh}/kWh)</option>`
            )
            .join('');
      }

      // If station was passed in URL, auto-calculate
      if (this.selectedStationId) {
        this.runEstimator();
      }
    } catch (err) {
      toast.error('Failed to load stations: ' + err.message);
    }
  }

  async loadBookings() {
    try {
      const res = await api.get('/bookings?limit=30');
      this.bookings = res.data || [];
      this.renderBookingsList();
    } catch (err) {
      toast.error('Failed to load bookings: ' + err.message);
    }
  }

  renderBookingsList() {
    const container = document.getElementById('bookings-list-container');
    if (!container) return;

    if (this.bookings.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📅</div>
          <p>You have no active or historical slot bookings.</p>
          <button id="btn-quick-reserve" class="btn btn-primary btn-sm" style="margin-top: 0.75rem;">
            Make Your First Reservation
          </button>
        </div>
      `;
      document.getElementById('btn-quick-reserve')?.addEventListener('click', () => {
        this.openBookingModal();
      });
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${this.bookings
          .map(b => {
            const start = new Date(b.startTime).toLocaleString('en-IN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const end = new Date(b.endTime).toLocaleString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            });

            const statusClass =
              b.status === 'confirmed'
                ? 'badge-success'
                : b.status === 'completed'
                  ? 'badge-info'
                  : 'badge-danger';

            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.9rem 1rem; background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px solid var(--border-color); flex-wrap: wrap; gap: 0.75rem;">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <strong style="color: var(--text-main); font-size: 0.95rem;">${b.stationName || 'VoltGrid Hub'}</strong>
                    <span class="badge ${statusClass}">${b.status.toUpperCase()}</span>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    <span>Bay: <strong>${b.chargerId}</strong></span> •
                    <span>${start} - ${end}</span>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${
                    b.estimatedCost
                      ? `<span style="font-size: 0.85rem; font-weight: 600; color: var(--accent-primary);">Est. ₹${b.estimatedCost}</span>`
                      : ''
                  }
                  ${
                    b.status === 'confirmed'
                      ? `
                    <button class="btn btn-secondary btn-sm btn-reschedule" data-id="${b._id}" data-start="${b.startTime}" data-end="${b.endTime}">Reschedule</button>
                    <button class="btn btn-danger btn-sm btn-cancel-booking" data-id="${b._id}">Cancel</button>
                  `
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    // Bind action buttons
    container.querySelectorAll('.btn-cancel-booking').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await api.patch(`/bookings/${id}/cancel`);
          toast.success('Reservation cancelled successfully');
          this.loadBookings();
        } catch (err) {
          toast.error('Failed to cancel: ' + err.message);
        }
      });
    });

    container.querySelectorAll('.btn-reschedule').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentStart = btn.dataset.start;
        const currentEnd = btn.dataset.end;
        this.openRescheduleModal(id, currentStart, currentEnd);
      });
    });
  }

  attachEvents() {
    document.getElementById('btn-open-booking-modal')?.addEventListener('click', () => {
      this.openBookingModal();
    });

    document.getElementById('form-estimator')?.addEventListener('submit', e => {
      e.preventDefault();
      this.runEstimator();
    });
  }

  async runEstimator() {
    const stationId = document.getElementById('est-station')?.value || this.selectedStationId;
    if (!stationId) {
      toast.warning('Please select a station to estimate costs.');
      return;
    }

    const battery = document.getElementById('est-battery')?.value || 40.5;
    const cur = document.getElementById('est-cur-soc')?.value || 20;
    const tgt = document.getElementById('est-tgt-soc')?.value || 80;

    try {
      const res = await api.get(
        `/bookings/estimate?stationId=${stationId}&batteryKWh=${battery}&currentSoc=${cur}&targetSoc=${tgt}&chargerPowerKW=60`
      );

      const data = res.data;
      const out = document.getElementById('est-results-output');
      if (out) {
        out.style.display = 'block';
        document.getElementById('est-out-energy').textContent = `${data.energyNeededKWh} kWh`;
        document.getElementById('est-out-cost').textContent = `₹${data.estimatedCost.toFixed(2)}`;
        document.getElementById('est-out-time').textContent =
          `${data.durationMinutes} mins (at 60kW DC)`;
      }
    } catch (err) {
      toast.error('Estimation failed: ' + err.message);
    }
  }

  openBookingModal() {
    const now = new Date();
    const defaultStart = new Date(now.getTime() + 15 * 60000).toISOString().slice(0, 16);
    const defaultEnd = new Date(now.getTime() + 75 * 60000).toISOString().slice(0, 16);

    const stationOptions = this.stations
      .map(
        s =>
          `<option value="${s._id}" ${s._id === this.selectedStationId ? 'selected' : ''}>${s.name} (${s.area})</option>`
      )
      .join('');

    const content = `
      <form id="form-new-booking" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="book-station">Select Charging Station *</label>
          <select id="book-station" class="input" required>
            <option value="">Select a station...</option>
            ${stationOptions}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="book-charger">Available Charger Bay *</label>
          <select id="book-charger" class="input" required>
            <option value="">Select station first...</option>
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="book-start">Start Time *</label>
            <input id="book-start" class="input" type="datetime-local" required value="${defaultStart}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="book-end">End Time *</label>
            <input id="book-end" class="input" type="datetime-local" required value="${defaultEnd}" />
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Confirm Slot Reservation</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Reserve Charging Slot',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    const stationSelect = document.getElementById('book-station');
    const chargerSelect = document.getElementById('book-charger');

    const updateChargers = () => {
      const selectedId = stationSelect.value;
      const st = this.stations.find(s => s._id === selectedId);
      if (!st || !st.chargers) {
        chargerSelect.innerHTML = '<option value="">No chargers found</option>';
        return;
      }
      chargerSelect.innerHTML = st.chargers
        .map(
          c =>
            `<option value="${c.chargerId}">${c.chargerId} • ${c.connector} (${c.powerKW}kW) - [${c.status.toUpperCase()}]</option>`
        )
        .join('');
    };

    stationSelect?.addEventListener('change', updateChargers);
    if (this.selectedStationId) {
      updateChargers();
    }

    document.getElementById('form-new-booking')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const payload = {
          stationId: stationSelect.value,
          chargerId: chargerSelect.value,
          startTime: new Date(document.getElementById('book-start').value).toISOString(),
          endTime: new Date(document.getElementById('book-end').value).toISOString(),
        };

        await api.post('/bookings', payload);
        toast.success('Reservation successfully confirmed!');
        modal.close();
        this.loadBookings();
      } catch (err) {
        toast.error('Booking failed: ' + err.message);
      }
    });
  }

  openRescheduleModal(bookingId, currentStart, currentEnd) {
    const formattedStart = new Date(currentStart).toISOString().slice(0, 16);
    const formattedEnd = new Date(currentEnd).toISOString().slice(0, 16);

    const content = `
      <form id="form-reschedule" style="display: flex; flex-direction: column; gap: 1rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="resched-start">New Start Time *</label>
            <input id="resched-start" class="input" type="datetime-local" required value="${formattedStart}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="resched-end">New End Time *</label>
            <input id="resched-end" class="input" type="datetime-local" required value="${formattedEnd}" />
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Slot</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Reschedule Charging Slot',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('form-reschedule')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const payload = {
          startTime: new Date(document.getElementById('resched-start').value).toISOString(),
          endTime: new Date(document.getElementById('resched-end').value).toISOString(),
        };

        await api.patch(`/bookings/${bookingId}/reschedule`, payload);
        toast.success('Slot rescheduled successfully!');
        modal.close();
        this.loadBookings();
      } catch (err) {
        toast.error('Reschedule failed: ' + err.message);
      }
    });
  }

  destroy() {}
}
