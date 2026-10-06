/**
 * Custom 404 Not Found View
 */

export const NotFoundView = {
  render(container) {
    container.innerHTML = `
      <div style="text-align:center; padding:5rem 1.5rem; max-width:540px; margin:0 auto;">
        <div style="font-size:5rem; font-weight:900; line-height:1; color:var(--accent-primary); margin-bottom:1rem; font-family:var(--font-mono);">
          404
        </div>
        <h1 style="font-size:1.75rem; font-weight:800; margin-bottom:0.75rem;">
          Corridor Route Not Located
        </h1>
        <p style="color:var(--text-secondary); margin-bottom:2rem; line-height:1.6;">
          The requested platform page or network station endpoint does not exist on the VoltGrid Bengaluru cluster.
        </p>
        <div style="display:flex; justify-content:center; gap:1rem;">
          <a href="#/" class="btn btn-primary">Return to Dashboard</a>
          <a href="#/map" class="btn btn-secondary">Open Network Map</a>
        </div>
      </div>
    `;
  },
};
