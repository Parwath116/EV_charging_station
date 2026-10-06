/**
 * Login View with Password Visibility Toggle and Demo Credentials Helper
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';

export const LoginView = {
  render(container, { query }) {
    const redirect = query?.get('redirect') || '#/';

    container.innerHTML = `
      <div style="max-width:440px; margin:2rem auto;">
        <div class="metric-card" style="padding:2.5rem 2rem; border-radius:var(--radius-lg); box-shadow:var(--shadow-lg);">
          <div style="text-align:center; margin-bottom:2rem;">
            <span class="brand-icon" style="font-size:2.5rem;">⚡</span>
            <h1 style="font-size:1.75rem; font-weight:800; margin-top:0.5rem;">Sign In to VoltGrid</h1>
            <p style="color:var(--text-secondary); font-size:0.9rem; margin-top:0.25rem;">
              Access your driver wallet, bookings, or operator station controls.
            </p>
          </div>

          <form id="form-login" novalidate>
            <div class="form-group">
              <label class="form-label" for="login-email">Email Address</label>
              <input
                id="login-email"
                name="email"
                class="form-input"
                type="email"
                placeholder="name@voltgrid.internal"
                required
                autocomplete="username"
              />
              <div id="email-error" class="form-error"></div>
            </div>

            <div class="form-group">
              <label class="form-label" for="login-password">Password</label>
              <div class="password-input-wrapper">
                <input
                  id="login-password"
                  name="password"
                  class="form-input"
                  type="password"
                  placeholder="••••••••••••"
                  required
                  autocomplete="current-password"
                />
                <button
                  id="btn-toggle-login-pass"
                  class="password-toggle-btn"
                  type="button"
                  aria-label="Show password"
                  title="Toggle password visibility"
                >
                  👁️
                </button>
              </div>
              <div id="password-error" class="form-error"></div>
            </div>

            <button id="btn-submit-login" class="btn btn-primary btn-block" type="submit" style="margin-top:1.5rem;">
              Sign In
            </button>
          </form>

          <!-- Quick Fill Demo Accounts -->
          <div style="margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--border-color);">
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.75rem; text-align:center;">
              Quick Fill Demo Accounts (Local Dev)
            </div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:0.5rem;">
              <button class="btn btn-sm btn-secondary" id="btn-demo-admin" type="button">Admin</button>
              <button class="btn btn-sm btn-secondary" id="btn-demo-operator" type="button">Operator</button>
              <button class="btn btn-sm btn-secondary" id="btn-demo-driver" type="button">Driver</button>
            </div>
          </div>

          <div style="text-align:center; margin-top:1.5rem; font-size:0.85rem; color:var(--text-secondary);">
            Don't have an account? <a href="#/register">Register as an EV Driver</a>
          </div>
        </div>
      </div>
    `;

    // 1. Password Visibility Toggle
    const passInput = container.querySelector('#login-password');
    const toggleBtn = container.querySelector('#btn-toggle-login-pass');

    toggleBtn.addEventListener('click', () => {
      const isPassword = passInput.getAttribute('type') === 'password';
      passInput.setAttribute('type', isPassword ? 'text' : 'password');
      toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      toggleBtn.textContent = isPassword ? '🙈' : '👁️';
    });

    // 2. Demo Fill Buttons
    const emailInput = container.querySelector('#login-email');
    const fill = (email, pass = 'VoltGrid#2026') => {
      emailInput.value = email;
      passInput.value = pass;
    };

    container.querySelector('#btn-demo-admin').addEventListener('click', () => {
      fill('admin@voltgrid.internal');
    });
    container.querySelector('#btn-demo-operator').addEventListener('click', () => {
      fill('operator.whitefield@voltgrid.internal');
    });
    container.querySelector('#btn-demo-driver').addEventListener('click', () => {
      fill('driver.aarav.mehta.1@voltgrid.internal');
    });

    // 3. Form Submission
    const form = container.querySelector('#form-login');
    const emailErr = container.querySelector('#email-error');
    const passErr = container.querySelector('#password-error');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      emailErr.textContent = '';
      passErr.textContent = '';

      const email = emailInput.value.trim();
      const password = passInput.value;

      if (!email) {
        emailErr.textContent = 'Email address is required.';
        return;
      }
      if (!password) {
        passErr.textContent = 'Password is required.';
        return;
      }

      const submitBtn = container.querySelector('#btn-submit-login');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';

      try {
        const response = await api.post('/auth/login', { email, password });
        if (response.success && response.data) {
          state.setUser(response.data);
          toast.success(`Welcome back, ${response.data.name.split(' ')[0]}!`);
          window.location.hash = redirect.startsWith('#') ? redirect : `#${redirect}`;
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
        passErr.textContent = err.message || 'Authentication failed. Please verify credentials.';
        toast.error(err.message || 'Login failed');
      }
    });
  },
};
