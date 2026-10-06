/**
 * Accessible Modal & Confirmation Dialog System
 */

export class ModalService {
  constructor() {
    this.activeModal = null;
    this.previousFocusedElement = null;

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.activeModal) {
        this.close();
      }
    });
  }

  open({ title, content, footer = null, onClose = null, size = 'default' }) {
    this.close(); // Close any currently open modal
    this.previousFocusedElement = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-dialog-title');

    const maxWidth = size === 'large' ? '800px' : size === 'small' ? '400px' : '540px';

    overlay.innerHTML = `
      <div class="modal-container" style="max-width: ${maxWidth};">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-dialog-title">${title}</h2>
          <button class="btn-icon" id="btn-modal-close" type="button" aria-label="Close dialog">&times;</button>
        </div>
        <div class="modal-body" id="modal-dialog-body"></div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    const bodyContainer = overlay.querySelector('#modal-dialog-body');
    if (typeof content === 'string') {
      bodyContainer.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      bodyContainer.appendChild(content);
    }

    const closeBtn = overlay.querySelector('#btn-modal-close');
    closeBtn.addEventListener('click', () => this.close());

    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        this.close();
      }
    });

    document.getElementById('modal-root').appendChild(overlay);
    this.activeModal = { overlay, onClose };

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Focus trap setup
    this.trapFocus(overlay);

    return overlay;
  }

  close() {
    if (!this.activeModal) return;

    const { overlay, onClose } = this.activeModal;
    overlay.remove();
    this.activeModal = null;
    document.body.style.overflow = '';

    if (typeof onClose === 'function') {
      onClose();
    }

    if (this.previousFocusedElement?.focus) {
      this.previousFocusedElement.focus();
    }
  }

  trapFocus(element) {
    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = Array.from(element.querySelectorAll(focusableSelectors));
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement) {
      setTimeout(() => firstElement.focus(), 50);
    }

    element.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    });
  }

  confirm({
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDestructive = false,
  }) {
    return new Promise(resolve => {
      const footerHtml = `
        <button id="btn-modal-cancel" class="btn btn-secondary" type="button">${cancelText}</button>
        <button id="btn-modal-confirm" class="btn ${isDestructive ? 'btn-danger' : 'btn-primary'}" type="button">${confirmText}</button>
      `;

      const modalEl = this.open({
        title,
        content: `<p style="color:var(--text-secondary); line-height:1.5;">${message}</p>`,
        footer: footerHtml,
        onClose: () => resolve(false),
      });

      modalEl.querySelector('#btn-modal-cancel').addEventListener('click', () => {
        this.close();
        resolve(false);
      });

      modalEl.querySelector('#btn-modal-confirm').addEventListener('click', () => {
        this.close();
        resolve(true);
      });
    });
  }
}

export const modal = new ModalService();
