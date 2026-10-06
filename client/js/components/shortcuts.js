/**
 * Keyboard Shortcuts Manager
 * Hotkeys: ?, /, t, g d, g m, n, Esc, Ctrl/Cmd+K.
 * Prevents execution when focused in text inputs.
 */

import { state } from '../state.js';
import { modal } from './modal.js';
import { commandPalette } from './commandPalette.js';
import { toast } from './toast.js';

export class ShortcutsManager {
  constructor() {
    this.sequenceBuffer = '';
    this.sequenceTimer = null;
  }

  init() {
    // Shortcuts help modal trigger button
    document.getElementById('btn-shortcuts-modal')?.addEventListener('click', () => {
      this.openShortcutsHelp();
    });

    // Command palette button
    document.getElementById('btn-cmd-palette')?.addEventListener('click', () => {
      commandPalette.open();
    });

    document.addEventListener('keydown', e => this.handleKeyDown(e));
  }

  isInputFocused(e) {
    const target = e.target;
    if (!target) return false;
    const tag = target.tagName?.toUpperCase();
    return (
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
    );
  }

  handleKeyDown(e) {
    // 1. Command Palette: Ctrl+K / Cmd+K (allowed everywhere)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      commandPalette.open();
      return;
    }

    // 2. Escape closes modals and command palette
    if (e.key === 'Escape') {
      commandPalette.close();
      modal.close();
      return;
    }

    // Ignore remaining hotkeys if typing inside form inputs
    if (this.isInputFocused(e)) return;

    // 3. Shortcuts Help Modal: '?'
    if (e.key === '?') {
      e.preventDefault();
      this.openShortcutsHelp();
      return;
    }

    // 4. Focus Search: '/'
    if (e.key === '/') {
      e.preventDefault();
      const searchInput = document.querySelector(
        'input[type="search"], input[name="search"], #station-search, #faq-search, .search-input'
      );
      if (searchInput) {
        searchInput.focus();
        searchInput.select?.();
      }
      return;
    }

    // 5. Theme Toggle: 't'
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      const newTheme = state.toggleTheme();
      toast.info(`Theme toggled to ${newTheme} mode.`);
      return;
    }

    // 6. New Station: 'n' (Admin or Operator only)
    if (e.key === 'n' || e.key === 'N') {
      const isPrivileged = state.user && ['admin', 'operator'].includes(state.user.role);
      if (isPrivileged) {
        e.preventDefault();
        window.location.hash = '#/stations';
        setTimeout(() => {
          document.getElementById('btn-create-station')?.click();
        }, 150);
      }
      return;
    }

    // 7. Two-key chord sequences: 'g' then 'd' or 'm'
    if (e.key === 'g' || e.key === 'G') {
      this.sequenceBuffer = 'g';
      clearTimeout(this.sequenceTimer);
      this.sequenceTimer = setTimeout(() => {
        this.sequenceBuffer = '';
      }, 1000);
      return;
    }

    if (this.sequenceBuffer === 'g') {
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        window.location.hash = '#/';
        this.sequenceBuffer = '';
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        window.location.hash = '#/map';
        this.sequenceBuffer = '';
      }
    }
  }

  openShortcutsHelp() {
    const contentHtml = `
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
          <tbody>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">Ctrl/Cmd + K</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">Open Command Palette</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">?</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">Show Keyboard Shortcuts</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">/</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">Focus Search Input</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">t</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">Toggle Dark / Light Theme</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">g d</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">Navigate to Dashboard</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">g m</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">Navigate to Network Map</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">n</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">New Station (Admin / Operator)</td>
            </tr>
            <tr>
              <td style="padding:0.6rem 0;"><kbd class="kbd-hint">Esc</kbd></td>
              <td style="padding:0.6rem 0; color:var(--text-secondary);">Close Modal or Palette</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    modal.open({
      title: 'Keyboard Shortcuts',
      content: contentHtml,
      size: 'small',
    });
  }
}

export const shortcuts = new ShortcutsManager();
