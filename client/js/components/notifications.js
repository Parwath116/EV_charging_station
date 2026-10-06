/**
 * VoltGrid Real-Time Notification & SSE Component
 * Handles real-time Server-Sent Events, notification bell badge, and alert resolution drawer.
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from './toast.js';

export class NotificationManager {
  constructor() {
    this.eventSource = null;
    this.unreadCount = 0;
    this.alerts = [];
    this.isOpen = false;
    this.reconnectTimer = null;
  }

  init() {
    this.bindDOM();
    this.connectSSE();
    this.refreshUnreadCount();
  }

  bindDOM() {
    const bellBtn = document.getElementById('btn-notifications');
    const closeBtn = document.getElementById('btn-close-notifications');
    const backdrop = document.getElementById('notifications-backdrop');

    bellBtn?.addEventListener('click', () => this.toggleDrawer());
    closeBtn?.addEventListener('click', () => this.closeDrawer());
    backdrop?.addEventListener('click', () => this.closeDrawer());

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeDrawer();
      }
    });
  }

  connectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource('/api/realtime/events');

      this.eventSource.addEventListener('alert', e => {
        try {
          const alertData = JSON.parse(e.data);
          this.handleIncomingAlert(alertData);
        } catch {
          // ignore parsing error
        }
      });

      this.eventSource.addEventListener('station_updated', e => {
        try {
          const stationData = JSON.parse(e.data);
          window.dispatchEvent(
            new CustomEvent('voltgrid:station_updated', { detail: stationData })
          );
        } catch {
          // ignore parsing error
        }
      });

      this.eventSource.addEventListener('alert_resolved', e => {
        try {
          const resolveData = JSON.parse(e.data);
          this.handleAlertResolved(resolveData.alertId);
        } catch {
          // ignore parsing error
        }
      });

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Attempt reconnect after 5s
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectSSE();
          }, 5000);
        }
      };
    } catch {
      // EventSource failed
    }
  }

  handleIncomingAlert(alert) {
    this.unreadCount += 1;
    this.updateBadge();
    this.alerts.unshift(alert);

    // Show live toast for high or critical anomalies
    if (alert.severity === 'critical' || alert.severity === 'high') {
      const icon = alert.severity === 'critical' ? '🚨' : '⚠️';
      toast.error(`${icon} [${alert.type.toUpperCase()}] ${alert.message}`);
    }

    if (this.isOpen) {
      this.renderAlertList();
    }
  }

  handleAlertResolved(alertId) {
    this.alerts = this.alerts.filter(a => a._id !== alertId);
    this.unreadCount = Math.max(0, this.unreadCount - 1);
    this.updateBadge();
    if (this.isOpen) {
      this.renderAlertList();
    }
  }

  async refreshUnreadCount() {
    if (!state.user || (state.user.role !== 'admin' && state.user.role !== 'operator')) {
      this.unreadCount = 0;
      this.updateBadge();
      return;
    }

    try {
      const res = await api.get('/alerts/unread-count');
      if (res.data) {
        this.unreadCount = res.data.count || 0;
        this.updateBadge();
      }
    } catch {
      // Ignore if unauthenticated
    }
  }

  updateBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  async toggleDrawer() {
    if (this.isOpen) {
      this.closeDrawer();
    } else {
      await this.openDrawer();
    }
  }

  async openDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    if (!drawer) return;

    drawer.removeAttribute('hidden');
    this.isOpen = true;
    document.body.style.overflow = 'hidden';

    await this.fetchAlerts();
    this.renderAlertList();
  }

  closeDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    if (!drawer) return;

    drawer.setAttribute('hidden', '');
    this.isOpen = false;
    document.body.style.overflow = '';
  }

  async fetchAlerts() {
    if (!state.user || (state.user.role !== 'admin' && state.user.role !== 'operator')) {
      this.alerts = [];
      return;
    }

    try {
      const res = await api.get('/alerts?acknowledged=false&limit=30');
      this.alerts = res.data || [];
      this.unreadCount = this.alerts.length;
      this.updateBadge();
    } catch {
      this.alerts = [];
    }
  }

  renderAlertList() {
    const container = document.getElementById('notifications-list');
    if (!container) return;

    if (this.alerts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 2.5rem 1rem; text-align: center; color: var(--text-secondary);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">✅</div>
          <p style="font-weight: 600;">All Systems Operational</p>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">No unresolved telemetry alarms or hardware faults.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.alerts
      .map(alert => {
        const severityClass =
          alert.severity === 'critical'
            ? 'badge-danger'
            : alert.severity === 'high'
              ? 'badge-warning'
              : 'badge-info';
        const formattedDate = new Date(alert.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        return `
          <div class="alert-card" data-id="${alert._id}" style="padding: 1rem; margin-bottom: 0.75rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); border-left: 4px solid ${
            alert.severity === 'critical' ? 'var(--status-faulted)' : 'var(--status-reserved)'
          };">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span class="badge ${severityClass}" style="text-transform: uppercase; font-size: 0.7rem; font-weight: 700;">${alert.severity}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${formattedDate}</span>
            </div>
            <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-main); margin-bottom: 0.25rem;">
              ${alert.type.replace(/_/g, ' ').toUpperCase()}
            </div>
            <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.75rem; line-height: 1.4;">
              ${alert.message}
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted);">
              <span>Charger: <code>${alert.chargerId}</code></span>
              ${
                state.hasRole('operator')
                  ? `<button class="btn btn-sm btn-secondary btn-resolve-alert" data-id="${alert._id}" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;">
                      Acknowledge & Resolve
                    </button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-resolve-alert').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.currentTarget.getAttribute('data-id');
        await this.resolveAlert(id);
      });
    });
  }

  async resolveAlert(id) {
    try {
      await api.patch(`/alerts/${id}/resolve`);
      toast.success('Alert resolved and archived to compliance audit trail.');
      this.handleAlertResolved(id);
    } catch (err) {
      toast.error('Failed to resolve alert: ' + err.message);
    }
  }
}

export const notifications = new NotificationManager();
