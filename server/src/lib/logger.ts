/**
 * Structured logger built on top of Pino.
 *
 * - In development (`NODE_ENV !== "production"`) output is pretty-printed via
 *   pino's built-in transport so that logs remain human-readable in the
 *   terminal.
 * - In production output is newline-delimited JSON, ready for ingestion by
 *   log aggregation tools.
 */

import pino, { type LoggerOptions } from 'pino';

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
        },
      }),
};

/**
 * Application-wide logger instance.
 *
 * Usage:
 * ```ts
 * import { logger } from '../lib/logger';
 * logger.info({ userId }, 'User logged in');
 * ```
 */
export const logger = pino(options);
