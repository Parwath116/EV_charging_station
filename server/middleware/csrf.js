import { ForbiddenError } from '../utils/errors.js';
import { env } from '../config/env.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/logout']);

/**
 * Cross-Site Request Forgery (CSRF) Defense Middleware
 * Protects cookie-authenticated state-changing requests against cross-origin abuse.
 */
export function csrfProtection(req, res, next) {
  // Safe read-only HTTP methods are exempt
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  // Exempt public onboarding / login / logout endpoints
  if (EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  // Authorization Bearer token requests cannot be initiated cross-origin by default browser form/link navigations
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  // 1. Modern browser Sec-Fetch-Site security guard
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return next(new ForbiddenError('Cross-site request blocked by CSRF defense policy'));
  }

  // 2. Origin verification if present
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const host = req.headers.host;
      if (originUrl.host !== host && origin !== env.CLIENT_ORIGIN) {
        return next(new ForbiddenError('Invalid request origin: cross-site origin rejected'));
      }
    } catch {
      return next(new ForbiddenError('Malformed Origin header'));
    }
  }

  // 3. Referer verification if Origin is missing
  const referer = req.headers.referer;
  if (!origin && referer) {
    try {
      const refUrl = new URL(referer);
      const host = req.headers.host;
      if (refUrl.host !== host && !referer.startsWith(env.CLIENT_ORIGIN)) {
        return next(new ForbiddenError('Invalid request referer: cross-site referer rejected'));
      }
    } catch {
      return next(new ForbiddenError('Malformed Referer header'));
    }
  }

  next();
}
