import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { userRepository } from '../repositories/user.repository.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export async function authenticate(req, res, next) {
  try {
    let token = req.cookies?.voltgrid_token;

    // Fallback to Bearer token in Authorization header
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required. No session token provided.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new UnauthorizedError('Session expired or invalid token');
    }

    const user = await userRepository.findById(decoded.id);
    if (!user) {
      throw new UnauthorizedError('User account associated with this session no longer exists');
    }

    const { passwordHash: _, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthenticate(req, res, next) {
  try {
    let token = req.cookies?.voltgrid_token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        const user = await userRepository.findById(decoded.id);
        if (user) {
          const { passwordHash: _, ...safeUser } = user;
          req.user = safeUser;
        }
      } catch {
        // Ignore invalid token in optional auth
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Role "${req.user.role}" is not authorized for this resource.`
        )
      );
    }

    next();
  };
}
