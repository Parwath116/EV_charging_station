/**
 * Command Palette (Ctrl+K / Cmd+K)
 * Fuzzy search over pages and actions with keyboard navigation.
 */

import { state } from '../state.js';
import { cookieConsent } from './cookieConsent.js';
import { toast } from './toast.js';

export class CommandPaletteManager {
  constructor() {
    this.isOpen = false;
    this.overlay = null;
    this.selectedIndex = 0;
    this.filteredCommands = [];
  }

  getCommands() {
    const isAdminOrOp = state.hasRole('admin', 'operator');

    const base = [
      {
        id: 'nav-home',
        label: 'Go to Dashboard',
        category: 'Navigation',
        icon: '🏠',
        action: () => (window.location.hash = '#/'),
      },
      {
        id: 'nav-map',
        label: 'Go to Network Map',
        category: 'Navigation',
        icon: '🗺️',
        action: () => (window.location.hash = '#/map'),
      },
      {
        id: 'nav-stations',
        label: 'Browse Charging Stations',
        category: 'Navigation',
        icon: '⚡',
        action: () => (window.location.hash = '#/stations'),
      },
      {
        id: 'nav-bookings',
        label: 'View Reservations & Bookings',
        category: 'Navigation',
        icon: '📅',
        action: () => (window.location.hash = '#/bookings'),
      },
      {
        id: 'nav-sessions',
        label: 'View Charging Sessions',
        category: 'Navigation',
        icon: '🔋',
        action: () => (window.location.hash = '#/sessions'),
      },
      {
        id: 'nav-help',
        label: 'Open Help & FAQ Documentation',
        category: 'Help',
        icon: '❓',
        action: () => (window.location.hash = '#/help'),
      },
      {
        id: 'act-theme',
        label: `Switch Theme to ${state.theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        category: 'Action',
        icon: '🌓',
        action: () => {
          const newTheme = state.toggleTheme();
          toast.info(`Theme changed to ${newTheme} mode.`);
        },
      },
      {
        id: 'act-cookies',
        label: 'Manage Cookie & Privacy Settings',
        category: 'Privacy',
        icon: '🍪',
        action: () => cookieConsent.openCustomizeModal(),
      },
    ];

    if (isAdminOrOp) {
      base.push(
        {
          id: 'nav-analytics',
          label: 'Open Network Analytics & Revenue',
          category: 'Admin',
          icon: '📊',
          action: () => (window.location.hash = '#/analytics'),
        },
        {
          id: 'nav-dblab',
          label: 'Open MongoDB Database Lab & explain()',
          category: 'Admin',
          icon: '🔬',
          action: () => (window.location.hash = '#/dblab'),
        },
        {
          id: 'act-new-station',
          label: 'Create New Charging Station',
          category: 'Admin',
          icon: '➕',
          action: () => {
            window.location.hash = '#/stations';
            setTimeout(() => {
              document.getElementById('btn-create-station')?.click();
            }, 100);
          },
        }
      );
    }

    if (state.isAuthenticated) {
      base.push({
        id: 'act-logout',
        label: 'Sign Out Account',
        category: 'Auth',
        icon: '🚪',
        action: () => state.logout(),
      });
    } else {
      base.push(
        {
          id: 'act-login',
          label: 'Sign In to VoltGrid',
          category: 'Auth',
          icon: '🔑',
          action: () => (window.location.hash = '#/login'),
        },
        {
          id: 'act-register',
          label: 'Create New Driver Account',
          category: 'Auth',
          icon: '📝',
          action: () => (window.location.hash = '#/register'),
        }
      );
    }

    return base;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.selectedIndex = 0;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'cmd-palette-overlay';
    overlay.style.alignItems = 'flex-start';
    overlay.style.paddingTop = '10vh';

    overlay.innerHTML = `
      <div class="cmd-palette-container" role="combobox" aria-expanded="true">
        <div class="cmd-input-wrapper">
          <span style="font-size:1.1rem; color:var(--accent-primary);" aria-hidden="true">🔍</span>
          <input
            id="cmd-palette-input"
            class="cmd-input"
            type="text"
            placeholder="Search commands, views, or actions... (Esc to exit)"
            autocomplete="off"
            aria-label="Search commands"
          />
        </div>
        <ul id="cmd-palette-results" class="cmd-results-list" role="listbox"></ul>
      </div>
    `;

    document.getElementById('modal-root').appendChild(overlay);
    this.overlay = overlay;

    const input = overlay.querySelector('#cmd-palette-input');
    input.focus();

    this.renderResults('');

    input.addEventListener('input', e => {
      this.selectedIndex = 0;
      this.renderResults(e.target.value);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
        this.updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex =
          (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
        this.updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = this.filteredCommands[this.selectedIndex];
        if (selected) {
          this.close();
          selected.action();
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) this.close();
    });
  }

  renderResults(query) {
    const list = this.overlay.querySelector('#cmd-palette-results');
    const q = query.trim().toLowerCase();
    const all = this.getCommands();

    this.filteredCommands = q
      ? all.filter(c => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
      : all;

    if (this.filteredCommands.length === 0) {
      list.innerHTML = `
        <li style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.9rem;">
          No matching commands or destinations found for "${query}"
        </li>
      `;
      return;
    }

    list.innerHTML = this.filteredCommands
      .map(
        (cmd, idx) => `
        <li
          class="cmd-item ${idx === this.selectedIndex ? 'selected' : ''}"
          data-index="${idx}"
          role="option"
          aria-selected="${idx === this.selectedIndex}"
        >
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <span>${cmd.icon}</span>
            <span>${cmd.label}</span>
          </div>
          <span class="cmd-item-badge">${cmd.category}</span>
        </li>
      `
      )
      .join('');

    list.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        const selected = this.filteredCommands[idx];
        if (selected) {
          this.close();
          selected.action();
        }
      });
    });
  }

  updateSelection() {
    const items = this.overlay.querySelectorAll('.cmd-item');
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }

  close() {
    if (!this.isOpen) return;
    this.overlay?.remove();
    this.overlay = null;
    this.isOpen = false;
  }
}

export const commandPalette = new CommandPaletteManager();
