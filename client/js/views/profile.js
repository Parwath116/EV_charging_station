/**
 * VoltGrid Driver & Operator Account Management Portal
 * User profile, atomic wallet balance top-ups ($inc), EV vehicle fleet ($push/$pull), and favourites.
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

export class ProfileView {
  constructor() {
    this.user = null;
    this.adminUsers = [];
  }

  async render(container) {
    if (!state.isAuthenticated) {
      container.innerHTML = `
        <div class="container" style="padding-top: var(--space-2xl); text-align: center;">
          <div class="card" style="max-width: 500px; margin: 0 auto; padding: 2rem;">
            <h2>Authentication Required</h2>
            <p style="color: var(--text-secondary); margin: 1rem 0 1.5rem 0;">
              Please sign in to manage your profile, vehicle fleet, and wallet balance.
            </p>
            <a href="#/login?redirect=profile" class="btn btn-primary">Sign In</a>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="profile-view-wrapper container" style="padding-top: var(--space-lg); padding-bottom: var(--space-2xl);">
        <!-- Header -->
        <div style="margin-bottom: 1.5rem;">
          <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem;">Account & EV Garage</h1>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">
            Manage your personal profile, vehicle specifications, digital wallet, and network favourites.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; margin-bottom: 2rem;">
          <!-- Profile Card -->
          <div class="card" style="padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
              <div>
                <h2 id="prof-name" style="font-size: 1.3rem; font-weight: 700; margin: 0; color: var(--text-main);">Loading...</h2>
                <div id="prof-email" style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem;">user@voltgrid.internal</div>
              </div>
              <span id="prof-role-badge" class="badge badge-info">DRIVER</span>
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem; display: flex; gap: 0.5rem;">
              <button id="btn-edit-profile" class="btn btn-secondary btn-sm">Edit Name</button>
              <button id="btn-change-pwd" class="btn btn-secondary btn-sm">Change Password</button>
            </div>
          </div>

          <!-- Digital Wallet Card -->
          <div class="card" style="padding: 1.5rem; border-color: var(--status-available);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1.25rem;">💳</span>
                <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">VoltGrid Wallet</h3>
              </div>
              <span class="badge badge-success">ACTIVE</span>
            </div>

            <div style="margin: 0.75rem 0 1rem 0;">
              <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Available Balance</div>
              <div id="prof-wallet-bal" style="font-size: 2rem; font-weight: 800; color: var(--status-available); font-family: var(--font-mono);">
                ₹0.00
              </div>
            </div>

            <!-- Quick Top-up buttons -->
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm btn-topup" data-amount="500">+ ₹500</button>
              <button class="btn btn-secondary btn-sm btn-topup" data-amount="1000">+ ₹1,000</button>
              <button class="btn btn-secondary btn-sm btn-topup" data-amount="2500">+ ₹2,500</button>
              <button id="btn-custom-topup" class="btn btn-primary btn-sm">Custom Top-up</button>
            </div>
          </div>
        </div>

        <!-- Vehicles Garage Section -->
        <div class="card" style="padding: 1.5rem; margin-bottom: 2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
            <div>
              <h2 style="font-size: 1.2rem; font-weight: 700; margin: 0;">Registered EV Fleet</h2>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">
                Saved electric vehicles used for battery capacity and connector compatibility checks.
              </p>
            </div>
            <button id="btn-add-vehicle" class="btn btn-primary btn-sm">
              <span>➕</span> Add Vehicle
            </button>
          </div>

          <div id="vehicles-list-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
            <p style="color: var(--text-secondary); font-size: 0.9rem;">Loading vehicles...</p>
          </div>
        </div>

        <!-- Admin Governance Section -->
        ${
          state.hasRole('admin')
            ? `
          <div class="card" style="padding: 1.5rem;">
            <h2 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 1rem;">Platform User Governance (Admin Only)</h2>
            <div id="admin-users-table-container">
              <p style="color: var(--text-secondary); font-size: 0.9rem;">Loading platform users...</p>
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;

    await this.loadUserProfile();
    if (state.hasRole('admin')) {
      await this.loadAdminUsers();
    }
    this.attachEvents();
  }

  async loadUserProfile() {
    try {
      const res = await api.get('/users/profile');
      this.user = res.data;

      // Update UI elements
      document.getElementById('prof-name').textContent = this.user.name;
      document.getElementById('prof-email').textContent = this.user.email;
      document.getElementById('prof-role-badge').textContent = (
        this.user.role || 'DRIVER'
      ).toUpperCase();
      document.getElementById('prof-wallet-bal').textContent =
        `₹${(this.user.walletBalance || 0).toFixed(2)}`;

      this.renderVehicles(this.user.vehicles || []);
    } catch (err) {
      toast.error('Failed to load user profile: ' + err.message);
    }
  }

  renderVehicles(vehicles) {
    const container = document.getElementById('vehicles-list-container');
    if (!container) return;

    if (vehicles.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px dashed var(--border-color);">
          <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">No vehicles registered to your garage yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = vehicles
      .map(
        v => `
        <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${v.make} ${v.model}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
              <span>Battery: <strong>${v.batteryKWh} kWh</strong></span> •
              <span class="badge badge-info" style="font-size: 0.7rem;">${v.connectorType}</span>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm btn-delete-vehicle" data-model="${encodeURIComponent(v.model)}" title="Remove vehicle" style="color: var(--status-faulted);">
            ✕
          </button>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.btn-delete-vehicle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const model = btn.dataset.model;
        try {
          await api.delete(`/users/vehicles/${model}`);
          toast.success('Vehicle removed from garage');
          await this.loadUserProfile();
        } catch (err) {
          toast.error('Failed to remove vehicle: ' + err.message);
        }
      });
    });
  }

  async loadAdminUsers() {
    try {
      const res = await api.get('/users?limit=50');
      this.adminUsers = res.data || [];
      const container = document.getElementById('admin-users-table-container');
      if (!container) return;

      container.innerHTML = `
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color); color: var(--text-secondary); text-transform: uppercase;">
                <th style="padding: 0.5rem;">Name</th>
                <th style="padding: 0.5rem;">Email</th>
                <th style="padding: 0.5rem;">Role</th>
                <th style="padding: 0.5rem;">Wallet</th>
                <th style="padding: 0.5rem;">Vehicles</th>
              </tr>
            </thead>
            <tbody>
              ${this.adminUsers
                .map(
                  u => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.5rem; font-weight: 600;">${u.name}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${u.email}</td>
                  <td style="padding: 0.5rem;"><span class="badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'operator' ? 'badge-warning' : 'badge-info'}">${u.role.toUpperCase()}</span></td>
                  <td style="padding: 0.5rem; font-family: var(--font-mono); color: var(--status-available);">₹${(u.walletBalance || 0).toFixed(2)}</td>
                  <td style="padding: 0.5rem; color: var(--text-secondary);">${(u.vehicles || []).length} registered</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch {
      // non-blocking
    }
  }

  attachEvents() {
    // Quick Top-up buttons
    document.querySelectorAll('.btn-topup').forEach(btn => {
      btn.addEventListener('click', async () => {
        const amount = Number(btn.dataset.amount);
        try {
          const res = await api.post('/users/wallet/topup', { amount });
          toast.success(res.message);
          await this.loadUserProfile();
          await state.fetchCurrentUser();
        } catch (err) {
          toast.error('Top-up failed: ' + err.message);
        }
      });
    });

    // Custom Top-up Button
    document.getElementById('btn-custom-topup')?.addEventListener('click', () => {
      this.openTopupModal();
    });

    // Add Vehicle Button
    document.getElementById('btn-add-vehicle')?.addEventListener('click', () => {
      this.openAddVehicleModal();
    });

    // Edit Name
    document.getElementById('btn-edit-profile')?.addEventListener('click', () => {
      this.openEditNameModal();
    });

    // Change Password
    document.getElementById('btn-change-pwd')?.addEventListener('click', () => {
      this.openChangePasswordModal();
    });
  }

  openTopupModal() {
    const content = `
      <form id="form-custom-topup" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="input-topup-amt">Amount in INR (₹) *</label>
          <input class="input" id="input-topup-amt" type="number" min="100" max="50000" step="50" required value="500" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Funds</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Top Up Digital Wallet',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('form-custom-topup')?.addEventListener('submit', async e => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('input-topup-amt').value);
      try {
        const res = await api.post('/users/wallet/topup', { amount });
        toast.success(res.message);
        modal.close();
        await this.loadUserProfile();
        await state.fetchCurrentUser();
      } catch (err) {
        toast.error('Top-up failed: ' + err.message);
      }
    });
  }

  openAddVehicleModal() {
    const content = `
      <form id="form-new-vehicle" style="display: flex; flex-direction: column; gap: 1rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="v-make">Make *</label>
            <input id="v-make" class="input" type="text" placeholder="Tata" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="v-model">Model *</label>
            <input id="v-model" class="input" type="text" placeholder="Nexon EV Max" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label" for="v-connector">Connector *</label>
            <select id="v-connector" class="input" required>
              <option value="CCS2">CCS2 (DC Fast)</option>
              <option value="Type2">Type2 (AC)</option>
              <option value="CHAdeMO">CHAdeMO</option>
              <option value="GB/T">GB/T</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="v-battery">Battery Size (kWh) *</label>
            <input id="v-battery" class="input" type="number" min="10" max="150" step="0.5" value="40.5" required />
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Vehicle</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Register Electric Vehicle',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('form-new-vehicle')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const payload = {
          make: document.getElementById('v-make').value.trim(),
          model: document.getElementById('v-model').value.trim(),
          connectorType: document.getElementById('v-connector').value,
          batteryKWh: parseFloat(document.getElementById('v-battery').value),
        };

        await api.post('/users/vehicles', payload);
        toast.success('Vehicle successfully registered!');
        modal.close();
        await this.loadUserProfile();
      } catch (err) {
        toast.error('Failed to add vehicle: ' + err.message);
      }
    });
  }

  openEditNameModal() {
    const currentName = this.user?.name || '';
    const content = `
      <form id="form-edit-name" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="input-new-name">Full Name *</label>
          <input id="input-new-name" class="input" type="text" required value="${currentName}" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Update Profile Name',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    document.getElementById('form-edit-name')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('input-new-name').value.trim();
      try {
        await api.put('/users/profile', { name });
        toast.success('Profile updated successfully!');
        modal.close();
        await this.loadUserProfile();
        await state.fetchCurrentUser();
      } catch (err) {
        toast.error('Update failed: ' + err.message);
      }
    });
  }

  openChangePasswordModal() {
    const content = `
      <form id="form-change-password" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="cp-current">Current Password *</label>
          <div class="password-input-wrapper">
            <input id="cp-current" class="form-input" type="password" required autocomplete="current-password" />
            <button id="btn-toggle-cp-curr" class="password-toggle-btn" type="button" aria-label="Toggle current password">👁️</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="cp-new">New Password *</label>
          <div class="password-input-wrapper">
            <input id="cp-new" class="form-input" type="password" required autocomplete="new-password" />
            <button id="btn-toggle-cp-new" class="password-toggle-btn" type="button" aria-label="Toggle new password">👁️</button>
          </div>
          <!-- Password Strength Meter -->
          <div class="password-strength-container" aria-live="polite" style="margin-top: 0.5rem;">
            <div class="strength-bar-track">
              <div class="strength-segment" id="cp-seg-1"></div>
              <div class="strength-segment" id="cp-seg-2"></div>
              <div class="strength-segment" id="cp-seg-3"></div>
              <div class="strength-segment" id="cp-seg-4"></div>
            </div>
            <div class="strength-label" id="cp-strength-label" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Password strength: Empty</div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
          <button type="button" class="btn btn-secondary" onclick="window.voltgridModalClose()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Change Account Password',
      content,
    });

    window.voltgridModalClose = () => modal.close();

    const currPassInput = document.getElementById('cp-current');
    const newPassInput = document.getElementById('cp-new');
    document.getElementById('btn-toggle-cp-curr')?.addEventListener('click', () => {
      currPassInput.type = currPassInput.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('btn-toggle-cp-new')?.addEventListener('click', () => {
      newPassInput.type = newPassInput.type === 'password' ? 'text' : 'password';
    });

    newPassInput?.addEventListener('input', () => {
      const val = newPassInput.value;
      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      const seg1 = document.getElementById('cp-seg-1');
      const seg2 = document.getElementById('cp-seg-2');
      const seg3 = document.getElementById('cp-seg-3');
      const seg4 = document.getElementById('cp-seg-4');
      const label = document.getElementById('cp-strength-label');

      [seg1, seg2, seg3, seg4].forEach((s, idx) => {
        if (!s) return;
        s.style.backgroundColor =
          idx < score
            ? score <= 1
              ? 'var(--status-faulted)'
              : score <= 2
                ? 'var(--accent-warning)'
                : score <= 3
                  ? 'var(--accent-primary)'
                  : 'var(--status-available)'
            : 'var(--border-color)';
      });

      const labels = ['Empty', 'Weak', 'Fair', 'Good', 'Strong'];
      if (label) label.textContent = `Password strength: ${labels[val ? score : 0]}`;
    });

    document.getElementById('form-change-password')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api.post('/auth/change-password', {
          currentPassword: currPassInput.value,
          newPassword: newPassInput.value,
        });
        toast.success('Password changed successfully!');
        modal.close();
      } catch (err) {
        toast.error('Failed to change password: ' + err.message);
      }
    });
  }

  destroy() {}
}
