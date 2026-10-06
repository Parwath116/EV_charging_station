/**
 * VoltGrid Client State Store
 * Manages user session, theme, cookie consent, and reactive subscriptions.
 */

import { api } from './api.js';

class StateStore {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.theme = localStorage.getItem('voltgrid_theme') || 'dark';
    this.listeners = new Map();
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key).delete(callback);
  }

  notify(key, value) {
    if (this.listeners.has(key)) {
      for (const cb of this.listeners.get(key)) {
        cb(value);
      }
    }
  }

  setUser(user) {
    this.user = user;
    this.isAuthenticated = Boolean(user);
    this.notify('user', this.user);
    this.updateHeaderAuthUI();
  }

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('voltgrid_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.notify('theme', theme);
  }

  toggleTheme() {
    const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
    return nextTheme;
  }

  async initAuth() {
    try {
      const response = await api.get('/auth/me');
      if (response.success && response.data) {
        this.setUser(response.data);
      } else {
        this.setUser(null);
      }
    } catch {
      this.setUser(null);
    }
  }

  updateHeaderAuthUI() {
    const container = document.getElementById('auth-controls');
    const drawerSlot = document.getElementById('drawer-auth-slot');
    const adminLinks = document.querySelectorAll('.admin-only');

    // Show/hide admin navigation items
    const isAdminOrOperator = this.user && ['admin', 'operator'].includes(this.user.role);
    adminLinks.forEach(el => {
      el.style.display = isAdminOrOperator ? 'inline-block' : 'none';
    });

    if (this.isAuthenticated && this.user) {
      const roleBadge = `<span class="brand-sub">${this.user.role.toUpperCase()}</span>`;
      const html = `
        <div class="user-profile-badge" style="display:flex; align-items:center; gap:0.5rem;">
          <span style="font-size:0.85rem; font-weight:600;">${this.user.name.split(' ')[0]}</span>
          ${roleBadge}
          <button id="btn-signout" class="btn btn-sm btn-secondary" type="button" title="Sign out">Sign Out</button>
        </div>
      `;
      if (container) container.innerHTML = html;
      if (drawerSlot) {
        drawerSlot.innerHTML = `
          <div style="margin-bottom:0.75rem; font-size:0.9rem;">Signed in as <strong>${this.user.name}</strong></div>
          <button id="btn-drawer-signout" class="btn btn-secondary btn-block" type="button">Sign Out</button>
        `;
      }

      // Attach sign out handlers
      document.getElementById('btn-signout')?.addEventListener('click', () => this.logout());
      document.getElementById('btn-drawer-signout')?.addEventListener('click', () => this.logout());
    } else {
      const html = `<a href="#/login" class="btn btn-sm btn-primary">Sign In</a>`;
      if (container) container.innerHTML = html;
      if (drawerSlot)
        drawerSlot.innerHTML = `<a href="#/login" class="btn btn-primary btn-block">Sign In</a>`;
    }
  }

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Continue client teardown regardless
    }
    this.setUser(null);
    window.location.hash = '#/login';
  }
}

export const state = new StateStore();
