import { env } from '../config/env.js';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
};

class Logger {
  constructor() {
    this.currentLevel = LOG_LEVELS[env?.LOG_LEVEL || 'info'] ?? 1;
  }

  _format(level, message, ...meta) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level] || COLORS.reset;
    const levelTag = `${color}[${level.toUpperCase().padEnd(5)}]${COLORS.reset}`;
    const timeTag = `${COLORS.dim}${timestamp}${COLORS.reset}`;

    let extra = '';
    if (meta.length > 0) {
      extra =
        ' ' +
        meta
          .map(item => {
            if (item instanceof Error) {
              return `\n${item.stack || item.message}`;
            }
            if (typeof item === 'object') {
              return JSON.stringify(item, null, 2);
            }
            return String(item);
          })
          .join(' ');
    }

    return `${timeTag} ${levelTag} ${message}${extra}`;
  }

  debug(message, ...meta) {
    if (this.currentLevel <= LOG_LEVELS.debug) {
      console.debug(this._format('debug', message, ...meta));
    }
  }

  info(message, ...meta) {
    if (this.currentLevel <= LOG_LEVELS.info) {
      console.info(this._format('info', message, ...meta));
    }
  }

  warn(message, ...meta) {
    if (this.currentLevel <= LOG_LEVELS.warn) {
      console.warn(this._format('warn', message, ...meta));
    }
  }

  error(message, ...meta) {
    if (this.currentLevel <= LOG_LEVELS.error) {
      console.error(this._format('error', message, ...meta));
    }
  }
}

export const logger = new Logger();
