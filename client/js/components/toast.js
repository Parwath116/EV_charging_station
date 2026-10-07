/**
 * Toast Notification System
 */

class ToastService {
  constructor() {
    this.container = null;
  }

  getContainer() {
    if (!this.container) {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container';
        this.container.setAttribute('role', 'region');
        this.container.setAttribute('aria-label', 'Notifications');
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);
      }
    }
    return this.container;
  }

  show(message, type = 'info', duration = 4000) {
    const container = this.getContainer();

    // Prevent toast overflow: keep at most 3 visible toasts
    while (container.children.length >= 3) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };

    toast.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:0.5rem;">
        <span style="font-weight:bold; font-size:1rem;" aria-hidden="true">${icons[type] || '•'}</span>
        <div class="toast-text">${message}</div>
      </div>
      <button class="toast-close-btn" type="button" aria-label="Dismiss notification">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close-btn');
    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'opacity 200ms ease, transform 200ms ease';
      setTimeout(() => toast.remove(), 200);
    };

    closeBtn.addEventListener('click', dismiss);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    container.appendChild(toast);
  }

  success(msg, duration) {
    this.show(msg, 'success', duration);
  }

  error(msg, duration) {
    this.show(msg, 'error', duration);
  }

  warn(msg, duration) {
    this.show(msg, 'warning', duration);
  }

  info(msg, duration) {
    this.show(msg, 'info', duration);
  }
}

export const toast = new ToastService();
