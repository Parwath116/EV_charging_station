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

    if (handler.roles && (!state.user || !handler.roles.includes(state.user.role))) {
      window.location.hash = '#/';
      return;
    }

    this.currentRoute = path;
    this.updateActiveNavLinks(path);

    // Scroll to top of viewport on navigation
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Render View
    if (this.container) {
      this.container.innerHTML = '';
      await handler.render(this.container, { params, query });
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
