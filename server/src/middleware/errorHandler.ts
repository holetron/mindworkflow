import { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error.status === 'number' ? error.status : 500;
  const response = {
    message: error.message || 'Internal server error',
    details: error.details,
  };

  if (process.env.NODE_ENV !== 'production' && error.stack) {
    Object.assign(response, { stack: error.stack });
  }

  res.status(status).json(response);
};
