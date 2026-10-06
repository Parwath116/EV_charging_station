/**
 * Skeleton Loaders, Empty States, and Error States
 */

export const Skeleton = {
  cards(count = 3) {
    return Array.from({ length: count })
      .map(
        () => `
      <div class="skeleton skeleton-card" style="margin-bottom:1rem;"></div>
    `
      )
      .join('');
  },

  tableRows(rows = 5, cols = 4) {
    return Array.from({ length: rows })
      .map(
        () => `
      <tr>
        ${Array.from({ length: cols })
          .map(
            () => `
          <td><div class="skeleton skeleton-text" style="height:14px; margin:0;"></div></td>
        `
          )
          .join('')}
      </tr>
    `
      )
      .join('');
  },

  chart() {
    return `
      <div class="skeleton" style="height:320px; width:100%; border-radius:var(--radius-md);"></div>
    `;
  },

  map() {
    return `
      <div class="skeleton" style="height:550px; width:100%; border-radius:var(--radius-lg);"></div>
    `;
  },

  emptyState({
    icon = '⚡',
    title = 'No records found',
    message = 'Try modifying your search or filter parameters.',
    actionHtml = '',
  }) {
    return `
      <div class="empty-state-card" style="text-align:center; padding:3rem 1.5rem; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg);">
        <div style="font-size:2.5rem; margin-bottom:0.75rem;" aria-hidden="true">${icon}</div>
        <h3 style="font-size:1.25rem; font-weight:700; margin-bottom:0.4rem;">${title}</h3>
        <p style="color:var(--text-secondary); max-width:420px; margin:0 auto 1.25rem;">${message}</p>
        ${actionHtml}
      </div>
    `;
  },

  errorState({
    title = 'Failed to load content',
    message = 'An unexpected network error occurred while retrieving data.',
    retryHandlerName = 'location.reload()',
  }) {
    return `
      <div class="error-state-card" style="text-align:center; padding:3rem 1.5rem; background:rgba(239, 68, 68, 0.08); border:1px solid var(--status-faulted); border-radius:var(--radius-lg);">
        <div style="font-size:2.5rem; margin-bottom:0.75rem;" aria-hidden="true">⚠️</div>
        <h3 style="font-size:1.25rem; font-weight:700; margin-bottom:0.4rem; color:var(--status-faulted);">${title}</h3>
        <p style="color:var(--text-secondary); max-width:420px; margin:0 auto 1.25rem;">${message}</p>
        <button class="btn btn-secondary" onclick="${retryHandlerName}" type="button">Retry Request</button>
      </div>
    `;
  },
};
