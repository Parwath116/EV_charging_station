/**
 * Vanilla Hash-based Client Router with Route Guards
 */

import { state } from './state.js';

export class Router {
  constructor(routes, containerId = 'router-view') {
    this.routes = routes;
    this.container = null;
    this.containerId = containerId;
    this.currentRoute = null;

    window.addEventListener('hashchange', () => this.handleRouting());
  }

  init() {
    this.container = document.getElementById(this.containerId);
    this.handleRouting();
  }

  parseHash() {
    const hash = window.location.hash.slice(1) || '/';
    const [pathPart, queryPart] = hash.split('?');
    const query = new URLSearchParams(queryPart || '');
    return { path: pathPart, query };
  }

  matchRoute(path) {
    // 1. Direct exact match
    if (this.routes[path]) {
      return { handler: this.routes[path], params: {} };
    }

    // 2. Dynamic route segments (e.g. /stations/:id)
    for (const [pattern, handler] of Object.entries(this.routes)) {
      if (!pattern.includes(':')) continue;

      const patternParts = pattern.split('/');
      const pathParts = path.split('/');

      if (patternParts.length !== pathParts.length) continue;

      const params = {};
      let match = true;

      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          const paramName = patternParts[i].slice(1);
          params[paramName] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        return { handler, params };
      }
    }

    // 3. Fallback to 404
    return { handler: this.routes['*'], params: {} };
  }

  async handleRouting() {
    const { path, query } = this.parseHash();
    const { handler, params } = this.matchRoute(path);

    if (!handler) return;

    // Check Route Guard
    if (handler.requiresAuth && !state.isAuthenticated) {
      window.location.hash = `#/login?redirect=${encodeURIComponent(path)}`;
      return;
    }

    if (handler.roles && !state.hasRole(...handler.roles)) {
      window.location.hash = '#/';
      return;
    }

    this.currentRoute = path;
    this.updateActiveNavLinks(path);

    // Scroll to top of viewport on navigation
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Cleanup previous view if it had a destroy lifecycle hook
    if (this.currentViewInstance && typeof this.currentViewInstance.destroy === 'function') {
      try {
        this.currentViewInstance.destroy();
      } catch (err) {
        console.warn('Error during view cleanup:', err);
      }
      this.currentViewInstance = null;
    }

    // Resolve view instance (handles both class constructors and plain objects)
    let viewInstance;
    if (typeof handler === 'function') {
      try {
        viewInstance = new handler();
      } catch {
        viewInstance = handler;
      }
    } else {
      viewInstance = handler;
    }
    this.currentViewInstance = viewInstance;

    // Render View with error boundary
    if (this.container && viewInstance) {
      this.container.innerHTML = '';
      try {
        if (typeof viewInstance.render === 'function') {
          await viewInstance.render(this.container, { params, query });
        } else if (typeof handler.render === 'function') {
          await handler.render(this.container, { params, query });
        }
      } catch (renderError) {
        console.error(
          `Error rendering view for route "${path}":`,
          renderError.stack || renderError
        );
        this.container.innerHTML = `
          <div class="container" style="padding: 4rem 1rem; text-align: center; max-width: 600px;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
            <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem;">View Rendering Error</h2>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
              ${renderError.message || 'An unexpected error occurred while loading this module.'}
            </p>
            ${
              renderError.stack
                ? `<pre style="text-align: left; background: var(--bg-surface, #1e293b); padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; margin-bottom: 1.5rem; border: 1px solid var(--border-color, #334155); color: #ef4444; font-family: monospace;">${renderError.stack}</pre>`
                : ''
            }
            <a href="#/" class="btn btn-primary">Return to Dashboard</a>
          </div>
        `;
      }
    }
  }

  updateActiveNavLinks(currentPath) {
    const links = document.querySelectorAll('.nav-link, .drawer-link');
    links.forEach(link => {
      const href = link.getAttribute('href');
      const routePath = href ? href.replace('#', '') : '';
      if (routePath === currentPath || (routePath !== '/' && currentPath.startsWith(routePath))) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }
}
