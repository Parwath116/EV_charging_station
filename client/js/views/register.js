/**
 * Register View with Password Visibility Toggle, Dynamic Strength Meter, and Vehicle Setup
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';

export const RegisterView = {
  render(container) {
    container.innerHTML = `
      <div style="max-width:520px; margin:2rem auto;">
        <div class="metric-card" style="padding:2.5rem 2rem; border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
          <div style="text-align:center; margin-bottom:2rem;">
            <span class="brand-icon" style="font-size:2.5rem;">⚡</span>
            <h1 style="font-size:1.75rem; font-weight:800; margin-top:0.5rem;">Join VoltGrid Network</h1>
            <p style="color:var(--text-secondary); font-size:0.9rem; margin-top:0.25rem;">
              Create your EV driver account with ₹500 initial charging credit.
            </p>
          </div>

          <form id="form-register" novalidate>
            <div class="form-group">
              <label class="form-label" for="reg-name">Full Name</label>
              <input
                id="reg-name"
                name="name"
                class="form-input"
                type="text"
                placeholder="Aarav Mehta"
                required
              />
              <div id="name-error" class="form-error"></div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-email">Email Address</label>
              <input
                id="reg-email"
                name="email"
                class="form-input"
                type="email"
                placeholder="driver@example.com"
                required
              />
              <div id="email-error" class="form-error"></div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-password">Password</label>
              <div class="password-input-wrapper">
                <input
                  id="reg-password"
                  name="password"
                  class="form-input"
                  type="password"
                  placeholder="Min. 8 chars, 1 number"
                  required
                />
                <button
                  id="btn-toggle-reg-pass"
                  class="password-toggle-btn"
                  type="button"
                  aria-label="Show password"
                  title="Toggle password visibility"
                >
                  👁️
                </button>
              </div>

              <!-- Password Strength Meter -->
              <div class="password-strength-container" aria-live="polite">
                <div class="strength-bar-track">
                  <div class="strength-segment" id="strength-seg-1"></div>
                  <div class="strength-segment" id="strength-seg-2"></div>
                  <div class="strength-segment" id="strength-seg-3"></div>
                  <div class="strength-segment" id="strength-seg-4"></div>
                </div>
                <div class="strength-label" id="strength-feedback-label">Password strength: Empty</div>
              </div>
              <div id="password-error" class="form-error"></div>
            </div>

            <!-- Vehicle Setup Section -->
            <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); margin:1.25rem 0;">
              <div style="font-weight:700; font-size:0.9rem; margin-bottom:0.75rem; color:var(--text-main);">
                Primary Electric Vehicle (Optional)
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                <div>
                  <label class="form-label" for="reg-veh-make" style="font-size:0.75rem;">Make</label>
                  <input id="reg-veh-make" class="form-input" type="text" placeholder="e.g. Tata" />
                </div>
                <div>
                  <label class="form-label" for="reg-veh-model" style="font-size:0.75rem;">Model</label>
                  <input id="reg-veh-model" class="form-input" type="text" placeholder="e.g. Nexon EV" />
                </div>
                <div>
                  <label class="form-label" for="reg-veh-connector" style="font-size:0.75rem;">Connector</label>
                  <select id="reg-veh-connector" class="form-select">
                    <option value="CCS2">CCS2 (DC Fast)</option>
                    <option value="Type2">Type 2 (AC)</option>
                    <option value="CHAdeMO">CHAdeMO</option>
                    <option value="GB/T">GB/T</option>
                  </select>
                </div>
                <div>
                  <label class="form-label" for="reg-veh-battery" style="font-size:0.75rem;">Battery (kWh)</label>
                  <input id="reg-veh-battery" class="form-input" type="number" placeholder="40.5" step="0.1" min="1" />
                </div>
              </div>
            </div>

            <button id="btn-submit-reg" class="btn btn-primary btn-block" type="submit">
              Complete Registration
            </button>
          </form>

          <div style="text-align:center; margin-top:1.5rem; font-size:0.85rem; color:var(--text-secondary);">
            Already have an account? <a href="#/login">Sign in</a>
          </div>
        </div>
      </div>
    `;

    // 1. Password Visibility Toggle
    const passInput = container.querySelector('#reg-password');
    const toggleBtn = container.querySelector('#btn-toggle-reg-pass');

    toggleBtn.addEventListener('click', () => {
      const isPassword = passInput.getAttribute('type') === 'password';
      passInput.setAttribute('type', isPassword ? 'text' : 'password');
      toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      toggleBtn.textContent = isPassword ? '🙈' : '👁️';
    });

    // 2. Password Strength Evaluation
    const seg1 = container.querySelector('#strength-seg-1');
    const seg2 = container.querySelector('#strength-seg-2');
    const seg3 = container.querySelector('#strength-seg-3');
    const seg4 = container.querySelector('#strength-seg-4');
    const feedback = container.querySelector('#strength-feedback-label');

    passInput.addEventListener('input', e => {
      const val = e.target.value;
      let score = 0;

      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[a-z]/.test(val)) score++;
      if (/[0-9]/.test(val) || /[^A-Za-z0-9]/.test(val)) score++;

      // Reset
      [seg1, seg2, seg3, seg4].forEach(s => (s.className = 'strength-segment'));

      if (!val) {
        feedback.textContent = 'Password strength: Empty';
      } else if (score <= 1) {
        seg1.classList.add('active-weak');
        feedback.textContent = 'Password strength: Weak (min. 8 characters required)';
      } else if (score === 2) {
        seg1.classList.add('active-medium');
        seg2.classList.add('active-medium');
        feedback.textContent = 'Password strength: Fair (add numbers or uppercase)';
      } else if (score === 3) {
        seg1.classList.add('active-strong');
        seg2.classList.add('active-strong');
        seg3.classList.add('active-strong');
        feedback.textContent = 'Password strength: Good';
      } else {
        seg1.classList.add('active-strong');
        seg2.classList.add('active-strong');
        seg3.classList.add('active-strong');
        seg4.classList.add('active-strong');
        feedback.textContent = 'Password strength: Excellent';
      }
    });

    // 3. Form Submission
    const form = container.querySelector('#form-register');
    const nameErr = container.querySelector('#name-error');
    const emailErr = container.querySelector('#email-error');
    const passErr = container.querySelector('#password-error');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      nameErr.textContent = '';
      emailErr.textContent = '';
      passErr.textContent = '';

      const name = container.querySelector('#reg-name').value.trim();
      const email = container.querySelector('#reg-email').value.trim();
      const password = passInput.value;

      if (!name) {
        nameErr.textContent = 'Name is required.';
        return;
      }
      if (!email) {
        emailErr.textContent = 'Email is required.';
        return;
      }
      if (password.length < 8) {
        passErr.textContent = 'Password must be at least 8 characters long.';
        return;
      }

      // Collect optional vehicle
      const make = container.querySelector('#reg-veh-make').value.trim();
      const model = container.querySelector('#reg-veh-model').value.trim();
      const connector = container.querySelector('#reg-veh-connector').value;
      const battery = parseFloat(container.querySelector('#reg-veh-battery').value);

      const vehicles = [];
      if (make && model && !isNaN(battery) && battery > 0) {
        vehicles.push({
          make,
          model,
          connectorType: connector,
          batteryKWh: battery,
        });
      }

      const submitBtn = container.querySelector('#btn-submit-reg');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Account...';

      try {
        const response = await api.post('/auth/register', {
          name,
          email,
          password,
          role: 'driver',
          vehicles,
        });

        if (response.success && response.data) {
          state.setUser(response.data);
          toast.success('Driver account created with ₹500 initial credit!');
          window.location.hash = '#/';
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Registration';
        if (err.message.includes('already registered')) {
          emailErr.textContent = err.message;
        } else {
          passErr.textContent = err.message || 'Registration failed.';
        }
        toast.error(err.message || 'Registration failed');
      }
    });
  },
};
