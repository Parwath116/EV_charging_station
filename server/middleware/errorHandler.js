import { ZodError } from 'zod';
import { MongoServerError } from 'mongodb';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
}

export function errorHandler(err, req, res, _next) {
  logger.error('Caught application error:', err);

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload or query parameters',
        details: formattedIssues,
      },
    });
  }

  // 2. Custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.name,
        message: err.message,
        details: err.details,
      },
    });
  }

  // 3. MongoDB Server Errors
  if (err instanceof MongoServerError) {
    // Duplicate Key Error (E11000)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_KEY_ERROR',
          message: `A record with this ${field} already exists`,
          field,
        },
      });
    }

    // Schema Validation Failure (Error 121)
    if (err.code === 121) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'SCHEMA_VALIDATION_ERROR',
          message: 'Document failed MongoDB collection schema validation',
          details: err.errInfo?.details || null,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
        mongoCode: err.code,
      },
    });
  }

  // 4. Bad JSON payload syntax
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body',
      },
    });
  }

  // 5. Default 500 Internal Server Error
  const statusCode = err.statusCode || 500;
  const message =
    env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'
      : err.message || 'An unexpected error occurred';

  return res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
      ...(env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    },
  });
}
