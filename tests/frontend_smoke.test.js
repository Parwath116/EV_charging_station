import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { createApp } from '../server/app.js';
import { connectDB, closeDB } from '../server/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Frontend SPA Routing, Role Authorization & Leaflet Map Smoke Tests', () => {
  const app = createApp();
  let server;
  let serverPort;
  let dom;
  let state;
  let router;

  const roles = {
    driver: {
      email: 'driver.aarav.mehta.1@voltgrid.internal',
      password: 'VoltGrid#2026',
      token: '',
      user: null,
    },
    operator: {
      email: 'operator.whitefield@voltgrid.internal',
      password: 'VoltGrid#2026',
      token: '',
      user: null,
    },
    admin: {
      email: 'admin@voltgrid.internal',
      password: 'VoltGrid#2026',
      token: '',
      user: null,
    },
  };

  const consoleErrors = [];
  const originalConsoleError = console.error;

  const switchAuth = roleKey => {
    const { token, user } = roles[roleKey];
    dom.window.localStorage.setItem('voltgrid_token', token);
    dom.window.localStorage.setItem('voltgrid_user', JSON.stringify(user));
    state.setAuth(token, user);
  };

  before(async () => {
    await connectDB();

    // 1. Start HTTP Server on ephemeral port for real API proxy
    await new Promise(resolve => {
      server = app.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });

    // 2. Authenticate all 3 test personas and capture tokens + user payloads
    for (const [roleKey, creds] of Object.entries(roles)) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: creds.email, password: creds.password });
      assert.strictEqual(res.status, 200, `Login failed for ${roleKey}`);
      creds.user = res.body.data;

      const cookies = res.headers['set-cookie'] || [];
      const tokenCookie = cookies.find(c => c.startsWith('voltgrid_token='));
      creds.token = tokenCookie ? tokenCookie.split(';')[0].replace('voltgrid_token=', '') : '';
      assert.ok(creds.token, `Token cookie not found for ${roleKey}`);
      assert.ok(creds.user?.role, `Role property not found for ${roleKey}`);
    }

    // 3. Setup JSDOM Browser Environment
    const htmlPath = path.resolve(__dirname, '../client/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    dom = new JSDOM(html, {
      url: `http://127.0.0.1:${serverPort}/#/`,
      pretendToBeVisual: true,
      runScripts: 'outside-only',
    });

    // Attach essential browser globals to globalThis
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.location = dom.window.location;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.SVGElement = dom.window.SVGElement;
    globalThis.customElements = dom.window.customElements;
    globalThis.Event = dom.window.Event;
    globalThis.CustomEvent = dom.window.CustomEvent;

    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: dom.window.navigator,
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore
    }

    // Mock scrollTo
    dom.window.scrollTo = () => {};
    globalThis.scrollTo = dom.window.scrollTo;

    // Load Leaflet into the JSDOM window
    const { default: L } = await import('leaflet');
    dom.window.L = L;
    globalThis.L = L;
    globalThis.window.L = L;

    // Proxy fetch to local test server for /api calls, preserving credentials & auth header
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      let url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api')) {
        url = `http://127.0.0.1:${serverPort}${url}`;
      }
      return originalFetch(url, init);
    };
    dom.window.fetch = globalThis.fetch;

    // Dynamically import client state and router
    const stateModule = await import('../client/js/state.js');
    state = stateModule.state;

    const mainModule = await import('../client/js/main.js');
    router = mainModule.router;
    router.container = dom.window.document.getElementById('router-view');

    // Intercept console.error to track rendering errors
    console.error = (...args) => {
      consoleErrors.push(args.map(a => (a?.stack ? a.stack : String(a))).join(' '));
      originalConsoleError(...args);
    };
  });

  after(async () => {
    console.error = originalConsoleError;
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await closeDB();
  });

  it('serves local vendor Leaflet CSS and JS with HTTP 200 and proper MIME types', async () => {
    const cssRes = await request(app).get('/vendor/leaflet/leaflet.css');
    assert.strictEqual(cssRes.status, 200);
    assert.match(cssRes.headers['content-type'], /css/);

    const jsRes = await request(app).get('/vendor/leaflet/leaflet.js');
    assert.strictEqual(jsRes.status, 200);
    assert.match(jsRes.headers['content-type'], /javascript/);
  });

  it('configures Helmet Content-Security-Policy to allow OSM map tiles and disallow CARTO hosts', async () => {
    const res = await request(app).get('/');
    assert.strictEqual(res.status, 200);

    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'CSP header should be present');
    assert.match(csp, /openstreetmap\.org/, 'CSP must allow openstreetmap.org tiles');
    assert.ok(!csp.includes('cartocdn.com'), 'CSP must not allow cartocdn.com');
    assert.ok(!csp.includes('carto.com'), 'CSP must not allow carto.com');
  });

  const testRoutes = [
    '/',
    '/map',
    '/stations',
    '/bookings',
    '/sessions',
    '/analytics',
    '/dblab',
    '/help',
    '/nonexistent-404',
  ];

  for (const role of ['driver', 'operator', 'admin']) {
    for (const routePath of testRoutes) {
      it(`renders route "#${routePath}" cleanly without crash or console error for role "${role}"`, async () => {
        switchAuth(role);
        consoleErrors.length = 0;

        dom.window.location.hash = `#${routePath}`;
        await router.handleRouting();

        // Wait for any asynchronous microtasks to finish
        await new Promise(resolve => setTimeout(resolve, 80));

        const routerView = dom.window.document.getElementById('router-view');
        const htmlContent = routerView.innerHTML;

        assert.ok(
          !htmlContent.includes('View Rendering Error'),
          `Route #${routePath} threw View Rendering Error:\n${htmlContent}`
        );
        assert.ok(
          !htmlContent.includes('is not a function'),
          `Route #${routePath} contains unresolved function call:\n${htmlContent}`
        );
        assert.strictEqual(
          consoleErrors.length,
          0,
          `Console errors logged on #${routePath}:\n${consoleErrors.join('\n')}`
        );
      });
    }

    if (role === 'driver') {
      it('enforces DRIVER restrictions on stations and map views', async () => {
        switchAuth('driver');

        // Check Stations View
        dom.window.location.hash = '#/stations';
        await router.handleRouting();
        await new Promise(r => setTimeout(r, 120));

        const editTariffBtns = dom.window.document.querySelectorAll('.btn-edit-tariff');
        const deleteStationBtns = dom.window.document.querySelectorAll('.btn-delete-station');
        const addStationBtn = dom.window.document.querySelector('#btn-create-station');
        const bulkImportBtn = dom.window.document.querySelector('#btn-bulk-import');

        assert.strictEqual(editTariffBtns.length, 0, 'Driver must not see edit tariff buttons');
        assert.strictEqual(
          deleteStationBtns.length,
          0,
          'Driver must not see delete station buttons'
        );
        assert.strictEqual(addStationBtn, null, 'Driver must not see add station button');
        assert.strictEqual(bulkImportBtn, null, 'Driver must not see bulk import button');

        // Check Map View
        dom.window.location.hash = '#/map';
        await router.handleRouting();
        await new Promise(r => setTimeout(r, 120));

        const mapAddBtn = dom.window.document.querySelector('#btn-add-station-map');
        assert.strictEqual(mapAddBtn, null, 'Driver must not see add station button on map');
      });
    }

    if (role === 'operator') {
      it('enforces OPERATOR permissions on stations and map views', async () => {
        switchAuth('operator');

        // Check Stations View
        dom.window.location.hash = '#/stations';
        await router.handleRouting();
        await new Promise(r => setTimeout(r, 120));

        const editTariffBtns = dom.window.document.querySelectorAll('.btn-edit-tariff');
        const deleteStationBtns = dom.window.document.querySelectorAll('.btn-delete-station');
        const addStationBtn = dom.window.document.querySelector('#btn-create-station');
        const bulkImportBtn = dom.window.document.querySelector('#btn-bulk-import');

        assert.ok(editTariffBtns.length > 0, 'Operator must see edit tariff buttons');
        assert.strictEqual(
          deleteStationBtns.length,
          0,
          'Operator must not see delete station buttons'
        );
        assert.ok(addStationBtn !== null, 'Operator must see add station button');
        assert.strictEqual(bulkImportBtn, null, 'Operator must not see bulk import button');

        // Check Map View
        dom.window.location.hash = '#/map';
        await router.handleRouting();
        await new Promise(r => setTimeout(r, 120));

        const mapAddBtn = dom.window.document.querySelector('#btn-add-station-map');
        assert.ok(mapAddBtn !== null, 'Operator must see add station button on map');
      });
    }

    if (role === 'admin') {
      it('enforces ADMIN privileges across stations, map, and database lab', async () => {
        switchAuth('admin');

        // Check Stations View
        dom.window.location.hash = '#/stations';
        await router.handleRouting();
        await new Promise(r => setTimeout(r, 120));

        const editTariffBtns = dom.window.document.querySelectorAll('.btn-edit-tariff');
        const deleteStationBtns = dom.window.document.querySelectorAll('.btn-delete-station');
        const addStationBtn = dom.window.document.querySelector('#btn-create-station');
        const bulkImportBtn = dom.window.document.querySelector('#btn-bulk-import');

        assert.ok(editTariffBtns.length > 0, 'Admin must see edit tariff buttons');
        assert.ok(deleteStationBtns.length > 0, 'Admin must see delete station buttons');
        assert.ok(addStationBtn !== null, 'Admin must see add station button');
        assert.ok(bulkImportBtn !== null, 'Admin must see bulk import button');

        // Check Map View
        dom.window.location.hash = '#/map';
        await router.handleRouting();
        await new Promise(r => setTimeout(r, 120));

        const mapAddBtn = dom.window.document.querySelector('#btn-add-station-map');
        assert.ok(mapAddBtn !== null, 'Admin must see add station button on map');

        // Check Database Lab
        dom.window.location.hash = '#/dblab';
        await router.handleRouting();
        await new Promise(r => setTimeout(r, 120));

        const routerView = dom.window.document.getElementById('router-view');
        assert.ok(
          !routerView.innerHTML.includes('Admin Access Required'),
          'Admin must have full access to Database Lab'
        );
        assert.ok(
          routerView.innerHTML.includes('Database Lab &amp; Query Diagnostics') ||
            routerView.innerHTML.includes('Database Lab & Query Diagnostics')
        );
      });
    }
  }

  it('verifies Leaflet map non-zero height, 16 markers, and dark/light tile switching', async () => {
    switchAuth('operator');

    dom.window.location.hash = '#/map';
    await router.handleRouting();
    await new Promise(r => setTimeout(r, 150));

    const mapContainer = dom.window.document.getElementById('leaflet-map');
    assert.ok(mapContainer, 'Map container must exist in DOM');
    assert.strictEqual(
      mapContainer.style.height,
      '600px',
      'Map container must have explicit 600px height'
    );

    const mapViewInstance = router.currentViewInstance;
    assert.ok(mapViewInstance, 'MapView instance must be active');
    assert.ok(mapViewInstance.map, 'Leaflet map must be initialized');
    assert.ok(mapViewInstance.markersGroup, 'Leaflet markers layer group must exist');

    // Verify all 16 Bengaluru stations are plotted as markers
    const markerCount = mapViewInstance.markersGroup.getLayers().length;
    assert.strictEqual(
      markerCount,
      16,
      `Expected 16 station markers on the map, but found ${markerCount}`
    );

    // Verify OpenStreetMap tile URL and attribution (no API key required, no CARTO attribution)
    assert.strictEqual(
      mapViewInstance.tileLayer._url,
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      'Must use OpenStreetMap tile layer'
    );
    assert.match(
      mapViewInstance.tileLayer.options.attribution,
      /openstreetmap\.org\/copyright/,
      'Must attribute OpenStreetMap contributors'
    );
    assert.ok(
      !mapViewInstance.tileLayer.options.attribution.includes('CARTO'),
      'Attribution must not mention CARTO'
    );

    // Verify referrerPolicy on TileLayer complies with OpenStreetMap volunteer tile usage policy
    assert.strictEqual(
      mapViewInstance.tileLayer.options.referrerPolicy,
      'strict-origin-when-cross-origin',
      'TileLayer must configure strict-origin-when-cross-origin to satisfy OpenStreetMap policy'
    );

    // Verify Theme Switching via CSS class toggling on map container (no second tile provider)
    mapViewInstance.updateMapTheme('dark');
    assert.ok(
      mapContainer.classList.contains('map-dark-theme'),
      'Dark theme must apply map-dark-theme class on map container'
    );

    mapViewInstance.updateMapTheme('light');
    assert.ok(
      !mapContainer.classList.contains('map-dark-theme'),
      'Light theme must remove map-dark-theme class on map container'
    );
  });

  it('verifies Helmet security headers send strict-origin-when-cross-origin Referrer-Policy and allow OSM tiles in CSP', async () => {
    const res = await request(app).get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.headers['referrer-policy'],
      'strict-origin-when-cross-origin',
      'Helmet must set Referrer-Policy to strict-origin-when-cross-origin'
    );

    const csp = res.headers['content-security-policy'] || '';
    assert.ok(
      csp.includes('https://tile.openstreetmap.org'),
      'CSP must permit https://tile.openstreetmap.org'
    );
    assert.ok(!csp.toLowerCase().includes('carto'), 'CSP must not permit any CARTO hosts');
  });
});
