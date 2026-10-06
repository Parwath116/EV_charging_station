/**
 * VoltGrid Live Charging Sessions & Telemetry Meter View
 * Active session tracker, live simulated power meter, wallet billing integration, and session log.
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';

export class SessionsView {
  constructor() {
    this.activeSession = null;
    this.sessions = [];
    this.stations = [];
    this.timerInterval = null;
    this.telemetryInterval = null;
    this.simulatedSoc = 45;
    this.simulatedEnergyKWh = 0;
  }

  async render(container) {
    if (!state.isAuthenticated) {
      container.innerHTML = `
        <div class="container" style="padding-top: var(--space-2xl); text-align: center;">
          <div class="card" style="max-width: 500px; margin: 0 auto; padding: 2rem;">
            <h2>Authentication Required</h2>
            <p style="color: var(--text-secondary); margin: 1rem 0 1.5rem 0;">
              Please sign in to initiate charging sessions and monitor active energy delivery.
            </p>
            <a href="#/login?redirect=sessions" class="btn btn-primary">Sign In</a>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="sessions-view-wrapper container" style="padding-top: var(--space-lg); padding-bottom: var(--space-2xl);">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <div>
            <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem;">Charging Sessions & Telemetry</h1>
            <p style="color: var(--text-secondary); font-size: 0.9rem;">
              Real-time energy dispenser metering, live power curves, and automated wallet settlement.
            </p>
          </div>
        </div>

        <!-- Active Session Card -->
        <div id="active-session-slot" style="margin-bottom: 2rem;">
          <div class="card" style="padding: 1.5rem; text-align: center; color: var(--text-secondary);">
            Checking for active charging sessions...
          </div>
        </div>

        <!-- Historical Sessions -->
        <div class="card" style="padding: 1.25rem;">
          <h2 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 1rem;">Session History & Billing</h2>
          <div id="sessions-table-container">
            <p style="color: var(--text-secondary); font-size: 0.9rem;">Loading session records...</p>
          </div>
        </div>
      </div>
    `;

    await this.loadStations();
    await this.checkActiveSession();
    await this.loadSessions();
  }

  async loadStations() {
    try {
      const res = await api.get('/stations?limit=50&status=active');
      this.stations = res.data || [];
    } catch {
      // non-blocking
    }
  }

  async checkActiveSession() {
    try {
      const res = await api.get('/sessions/active');
      this.activeSession = res.data;
      this.renderActiveSessionCard();
    } catch {
      this.activeSession = null;
      this.renderActiveSessionCard();
    }
  }

  renderActiveSessionCard() {
    const slot = document.getElementById('active-session-slot');
    if (!slot) return;

    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.telemetryInterval) clearInterval(this.telemetryInterval);

    if (!this.activeSession) {
      // Render launcher card
      const stationOptions = this.stations
        .map(
          s => `<option value="${s._id}">${s.name} (${s.area}) - ₹${s.tariffPerKWh}/kWh</option>`
        )
        .join('');

      slot.innerHTML = `
        <div class="card" style="padding: 1.5rem; border-left: 4px solid var(--accent-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0; color: var(--text-main);">No Active Session in Progress</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
                Connect to a VoltGrid charger dispenser to initiate live energy delivery.
              </p>
            </div>
            <span class="badge badge-info">DISPENSER READY</span>
          </div>

          <form id="form-start-session" style="display: grid; grid-template-columns: 2fr 1fr auto; gap: 0.75rem; align-items: end;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="session-station" style="font-size: 0.8rem;">Select Station</label>
              <select id="session-station" class="input" style="font-size: 0.85rem;" required>
                <option value="">Choose charging station...</option>
                ${stationOptions}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="session-charger" style="font-size: 0.8rem;">Select Charger Bay</label>
              <select id="session-charger" class="input" style="font-size: 0.85rem;" required>
                <option value="">Select station first...</option>
              </select>
            </div>

            <button type="submit" class="btn btn-primary" style="height: 42px;">
              <span>🔌</span> Plug In & Start
            </button>
          </form>
        </div>
      `;

      const stSelect = document.getElementById('session-station');
      const chgSelect = document.getElementById('session-charger');

      stSelect?.addEventListener('change', () => {
        const station = this.stations.find(s => s._id === stSelect.value);
        if (!station) {
          chgSelect.innerHTML = '<option value="">Select station first...</option>';
          return;
        }
        chgSelect.innerHTML = (station.chargers || [])
          .map(
            c =>
              `<option value="${c.chargerId}">${c.chargerId} • ${c.connector} (${c.powerKW}kW) - [${c.status.toUpperCase()}]</option>`
          )
          .join('');
      });

      document.getElementById('form-start-session')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const res = await api.post('/sessions/start', {
            stationId: stSelect.value,
            chargerId: chgSelect.value,
          });
          toast.success('Charging session initiated!');
          this.activeSession = res.data;
          this.simulatedSoc = 35;
          this.simulatedEnergyKWh = 1.2;
          this.renderActiveSessionCard();
          this.loadSessions();
        } catch (err) {
          toast.error('Failed to start session: ' + err.message);
        }
      });

      return;
    }

    // Render active charging meter
    const session = this.activeSession;
    const startTime = new Date(session.startedAt || session.createdAt).getTime();

    slot.innerHTML = `
      <div class="card" style="padding: 1.5rem; border: 1px solid var(--accent-primary); box-shadow: 0 0 20px var(--accent-glow);">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: var(--status-charging); animation: pulse 1.5s infinite;"></span>
              <h2 style="font-size: 1.3rem; font-weight: 700; margin: 0; color: var(--text-main);">Active Charging Session</h2>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
              Dispenser Bay: <strong>${session.chargerId}</strong> • Station ID: <code>${session.stationId}</code>
            </p>
          </div>
          <button id="btn-stop-session" class="btn btn-danger" type="button">
            <span>🛑</span> Stop Charging & Settle Bill
          </button>
        </div>

        <!-- Metrics Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Elapsed Time</div>
            <div id="meter-timer" style="font-size: 1.4rem; font-weight: 700; color: var(--text-main); font-family: var(--font-mono);">00:00</div>
          </div>

          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Energy Delivered</div>
            <div id="meter-energy" style="font-size: 1.4rem; font-weight: 700; color: var(--accent-primary); font-family: var(--font-mono);">1.2 kWh</div>
          </div>

          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Charging Power</div>
            <div id="meter-power" style="font-size: 1.4rem; font-weight: 700; color: var(--status-available); font-family: var(--font-mono);">58.4 kW</div>
          </div>

          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">State of Charge</div>
            <div id="meter-soc" style="font-size: 1.4rem; font-weight: 700; color: var(--text-main); font-family: var(--font-mono);">45%</div>
          </div>

          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Accumulated Cost</div>
            <div id="meter-cost" style="font-size: 1.4rem; font-weight: 700; color: var(--accent-primary); font-family: var(--font-mono);">₹21.60</div>
          </div>
        </div>
      </div>
    `;

    // Stop Session Button Listener
    document.getElementById('btn-stop-session')?.addEventListener('click', async () => {
      try {
        const finalEnergy = Number(this.simulatedEnergyKWh.toFixed(2));
        const res = await api.post(`/sessions/${session._id}/stop`, {
          finalEnergyKWh: Math.max(1.0, finalEnergy),
        });

        toast.success(`Session completed! Billed ₹${res.data.cost.toFixed(2)} from your wallet.`);
        await state.fetchCurrentUser(); // refresh wallet
        this.activeSession = null;
        this.renderActiveSessionCard();
        this.loadSessions();
      } catch (err) {
        toast.error('Failed to stop session: ' + err.message);
      }
    });

    // Run Real-time ticker
    this.timerInterval = setInterval(() => {
      const diffSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
      const mins = Math.floor(diffSec / 60)
        .toString()
        .padStart(2, '0');
      const secs = (diffSec % 60).toString().padStart(2, '0');
      const timerEl = document.getElementById('meter-timer');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;

      // Simulate energy accumulation
      this.simulatedEnergyKWh += 0.08;
      const energyEl = document.getElementById('meter-energy');
      if (energyEl) energyEl.textContent = `${this.simulatedEnergyKWh.toFixed(2)} kWh`;

      const costEl = document.getElementById('meter-cost');
      if (costEl) costEl.textContent = `₹${(this.simulatedEnergyKWh * 18.0).toFixed(2)}`;

      if (this.simulatedSoc < 98) {
        this.simulatedSoc += 0.05;
        const socEl = document.getElementById('meter-soc');
        if (socEl) socEl.textContent = `${Math.round(this.simulatedSoc)}%`;
      }
    }, 1000);

    // Periodically post telemetry
    this.telemetryInterval = setInterval(async () => {
      try {
        await api.post('/sessions/telemetry', {
          stationId: session.stationId,
          chargerId: session.chargerId,
          sessionId: session._id,
          powerKW: 58.4,
          voltage: 405,
          currentA: 144,
          socPercent: Math.round(this.simulatedSoc),
          temperatureC: 36,
        });
      } catch {
        // silent
      }
    }, 10000);
  }

  async loadSessions() {
    try {
      const res = await api.get('/sessions?limit=25');
      this.sessions = res.data || [];
      this.renderSessionsTable();
    } catch (err) {
      toast.error('Failed to load session history: ' + err.message);
    }
  }

  renderSessionsTable() {
    const container = document.getElementById('sessions-table-container');
    if (!container) return;

    if (this.sessions.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No charging sessions recorded yet.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color); color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase;">
              <th style="padding: 0.75rem 0.5rem;">Station / Location</th>
              <th style="padding: 0.75rem 0.5rem;">Bay</th>
              <th style="padding: 0.75rem 0.5rem;">Started</th>
              <th style="padding: 0.75rem 0.5rem;">Energy</th>
              <th style="padding: 0.75rem 0.5rem;">Cost</th>
              <th style="padding: 0.75rem 0.5rem;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${this.sessions
              .map(s => {
                const started = new Date(s.startedAt || s.createdAt).toLocaleString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return `
                  <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--text-main);">
                      ${s.stationName || 'VoltGrid Hub'}
                      <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 400;">${s.stationArea || 'Bengaluru'}</div>
                    </td>
                    <td style="padding: 0.75rem 0.5rem; font-family: var(--font-mono); font-size: 0.8rem;">${s.chargerId}</td>
                    <td style="padding: 0.75rem 0.5rem; color: var(--text-secondary); font-size: 0.85rem;">${started}</td>
                    <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--accent-primary);">${(s.energyKWh || 0).toFixed(1)} kWh</td>
                    <td style="padding: 0.75rem 0.5rem; font-weight: 600; color: var(--text-main);">₹${(s.cost || 0).toFixed(2)}</td>
                    <td style="padding: 0.75rem 0.5rem;">
                      <span class="badge ${s.paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}">
                        ${(s.paymentStatus || 'PENDING').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.telemetryInterval) clearInterval(this.telemetryInterval);
  }
}
