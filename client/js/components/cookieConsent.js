/**
 * Cookie Consent Manager
 * Handles granular consent (Necessary, Preferences, Analytics), cookies, and footer settings.
 */

import { modal } from './modal.js';
import { toast } from './toast.js';

const COOKIE_NAME = 'voltgrid_cookie_consent';

export class CookieConsentManager {
  constructor() {
    this.consent = this.getStoredConsent();
  }

  getStoredConsent() {
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
      const [key, value] = c.trim().split('=');
      if (key === COOKIE_NAME) {
        try {
          return JSON.parse(decodeURIComponent(value));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  saveConsent(consent) {
    this.consent = consent;
    const value = encodeURIComponent(JSON.stringify(consent));
    const expires = new Date(Date.now() + 365 * 86400000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${value}; expires=${expires}; path=/; SameSite=Lax`;
    localStorage.setItem(COOKIE_NAME, JSON.stringify(consent));
  }

  init() {
    // If not previously stored, render banner
    if (!this.consent) {
      this.renderBanner();
    }

    // Attach footer trigger
    document.getElementById('btn-manage-cookies')?.addEventListener('click', () => {
      this.openCustomizeModal();
    });
  }

  renderBanner() {
    const slot = document.getElementById('cookie-banner-slot');
    if (!slot) return;

    slot.innerHTML = `
      <div class="cookie-banner" role="region" aria-label="Cookie consent">
        <div class="cookie-banner-inner">
          <div class="cookie-banner-text">
            <p>
              VoltGrid uses cookies to ensure platform security, store your dashboard preferences, and capture anonymized telemetry analytics for grid load balancing.
            </p>
          </div>
          <div class="cookie-banner-actions">
            <button id="btn-cookie-reject" class="btn btn-sm btn-secondary" type="button">Reject Non-Essential</button>
            <button id="btn-cookie-custom" class="btn btn-sm btn-secondary" type="button">Customize</button>
            <button id="btn-cookie-accept" class="btn btn-sm btn-primary" type="button">Accept All</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-cookie-accept')?.addEventListener('click', () => {
      this.saveConsent({ necessary: true, preferences: true, analytics: true });
      this.removeBanner();
      toast.success('Cookie preferences updated.');
    });

    document.getElementById('btn-cookie-reject')?.addEventListener('click', () => {
      this.saveConsent({ necessary: true, preferences: false, analytics: false });
      this.removeBanner();
      toast.info('Non-essential cookies disabled.');
    });

    document.getElementById('btn-cookie-custom')?.addEventListener('click', () => {
      this.openCustomizeModal();
    });
  }

  removeBanner() {
    const banner = document.querySelector('.cookie-banner');
    if (banner) banner.remove();
  }

  openCustomizeModal() {
    const current = this.consent || { necessary: true, preferences: true, analytics: true };

    const contentHtml = `
      <div style="display:flex; flex-direction:column; gap:1.25rem;">
        <p style="color:var(--text-secondary); font-size:0.9rem;">
          Configure your cookie privacy preferences. Essential cookies are required to authenticate sessions and cannot be deactivated.
        </p>

        <div style="background:var(--bg-card); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>Strictly Necessary Cookies</strong>
            <input type="checkbox" checked disabled aria-label="Strictly necessary cookies (always active)">
          </div>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
            Essential for account authentication (HttpOnly JWT) and security verification.
          </p>
        </div>

        <div style="background:var(--bg-card); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>Preference Cookies</strong>
            <input type="checkbox" id="cookie-pref-checkbox" ${current.preferences ? 'checked' : ''} aria-label="Preference cookies">
          </div>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
            Preserves your dark/light theme choices and map filtering settings.
          </p>
        </div>

        <div style="background:var(--bg-card); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>Analytics & Telemetry</strong>
            <input type="checkbox" id="cookie-analytics-checkbox" ${current.analytics ? 'checked' : ''} aria-label="Analytics cookies">
          </div>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
            Collects aggregated platform performance data for grid infrastructure optimization.
          </p>
        </div>
      </div>
    `;

    const footerHtml = `
      <button id="btn-save-cookie-prefs" class="btn btn-primary" type="button">Save Preferences</button>
    `;

    const modalEl = modal.open({
      title: 'Cookie & Privacy Preferences',
      content: contentHtml,
      footer: footerHtml,
    });

    modalEl.querySelector('#btn-save-cookie-prefs').addEventListener('click', () => {
      const preferences = modalEl.querySelector('#cookie-pref-checkbox').checked;
      const analytics = modalEl.querySelector('#cookie-analytics-checkbox').checked;

      this.saveConsent({ necessary: true, preferences, analytics });
      modal.close();
      this.removeBanner();
      toast.success('Privacy preferences saved successfully.');
    });
  }
}

export const cookieConsent = new CookieConsentManager();
