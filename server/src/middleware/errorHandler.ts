import { ErrorRequestHandler } from 'express';
import * as fs from 'fs';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'errorHandler' });
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error.status === 'number' ? error.status : 500;
  const response = {
    message: error.message || 'Internal server error',
    details: error.details,
  };

  if (process.env.NODE_ENV !== 'production' && error.stack) {
    Object.assign(response, { stack: error.stack });
  }

  const logMessage = `[${new Date().toISOString()}] ${error.stack || error.message}\n`;
  fs.appendFile('/root/error.log', logMessage, (err) => {
    if (err) {
      log.error({ err: err }, 'Failed to write to log file');
    }
  });

  res.status(status).json(response);
};
