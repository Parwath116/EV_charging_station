import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const logMsg = `${method} ${originalUrl} ${status} - ${duration}ms`;

    if (status >= 500) {
      logger.error(logMsg);
    } else if (status >= 400) {
      logger.warn(logMsg);
    } else {
      logger.info(logMsg);
    }
  });

  next();
}
