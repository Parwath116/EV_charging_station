import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { csrfProtection } from './middleware/csrf.js';
import apiRouter from './routes/api.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.resolve(__dirname, '..', 'client');

export function createApp() {
  const app = express();

  // 1. Security Headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://unpkg.com',
            'https://cdn.jsdelivr.net',
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://tile.openstreetmap.org',
            'https://*.tile.openstreetmap.org',
            'https://*.openstreetmap.org',
            'https://unpkg.com',
            'https://cdn.jsdelivr.net',
          ],
          connectSrc: ["'self'", env.CLIENT_ORIGIN],
          workerSrc: ["'self'", 'blob:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  // 2. Explicit CORS
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // 3. Body Parsing & Cookies
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // 4. CSRF Protection for state-changing endpoints
  app.use(csrfProtection);

  // 5. Request Logging
  app.use(requestLogger);

  // 5. Static Assets (Client App & Local Leaflet Distribution)
  const leafletDist = path.resolve(__dirname, '../node_modules/leaflet/dist');
  app.use('/vendor/leaflet', express.static(leafletDist));
  app.use(express.static(clientPath));

  // 6. API Routes
  app.use('/api', apiRouter);

  // 7. Client Single-Page App Fallback (for non-API GET requests)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientPath, 'index.html'));
  });

  // 8. 404 & Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
