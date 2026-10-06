/**
 * VoltGrid Client Bootstrap & Shell Orchestrator
 */

import { state } from './state.js';
import { Router } from './router.js';
import { shortcuts } from './components/shortcuts.js';
import { cookieConsent } from './components/cookieConsent.js';
import { notifications } from './components/notifications.js';
import { HomeView } from './views/home.js';
import { MapView } from './views/map.js';
import { StationsView } from './views/stations.js';
import { BookingsView } from './views/bookings.js';
import { SessionsView } from './views/sessions.js';
import { ProfileView } from './views/profile.js';
import { LoginView } from './views/login.js';
import { RegisterView } from './views/register.js';
import { HelpView } from './views/help.js';
import { AnalyticsView } from './views/analytics.js';
import { LabView } from './views/lab.js';
import { NotFoundView } from './views/notFound.js';

// Setup Route Table
const routes = {
  '/': HomeView,
  '/map': MapView,
  '/stations': StationsView,
  '/bookings': BookingsView,
  '/sessions': SessionsView,
  '/profile': ProfileView,
  '/analytics': AnalyticsView,
  '/dblab': LabView,
  '/login': LoginView,
  '/register': RegisterView,
  '/help': HelpView,
  '*': NotFoundView,
};

export const router = new Router(routes, 'router-view');

/**
 * Scroll Progress & Back-to-Top Handler
 */
function initScrollInteractions() {
  const progressBar = document.getElementById('scroll-progress');
  const backToTopBtn = document.getElementById('btn-back-to-top');

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight =
      document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const progressPercent = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }

    if (backToTopBtn) {
      if (scrollTop > 400) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    }
  });

  backToTopBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/**
 * Accessible Mobile Drawer Setup
 */
function initMobileDrawer() {
  const toggleBtn = document.getElementById('btn-mobile-menu');
  const drawer = document.getElementById('mobile-drawer');
  const closeBtn = document.getElementById('btn-close-drawer');
  const backdrop = document.getElementById('drawer-backdrop');

  if (!toggleBtn || !drawer) return;

  const openDrawer = () => {
    drawer.removeAttribute('hidden');
    toggleBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    closeBtn?.focus();
  };

  const closeDrawer = () => {
    drawer.setAttribute('hidden', '');
    toggleBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    toggleBtn.focus();
  };

  toggleBtn.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !drawer.hasAttribute('hidden')) {
      closeDrawer();
    }
  });

  // Close drawer on internal link click
  drawer.querySelectorAll('.drawer-link').forEach(link => {
    link.addEventListener('click', () => closeDrawer());
  });
}

/**
 * Global Theme Toggle
 */
function initThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  btn?.addEventListener('click', () => {
    state.toggleTheme();
  });
}

/**
 * Bootstrap Application
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize State & Authenticate from HttpOnly Cookie
  await state.initAuth();

  // 2. Initialize UI Components
  initScrollInteractions();
  initMobileDrawer();
  initThemeToggle();
  shortcuts.init();
  cookieConsent.init();
  notifications.init();

  // 3. Mount Client SPA Router
  router.init();
});
