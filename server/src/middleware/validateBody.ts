import { RequestHandler } from 'express';
import Ajv, { AnySchema } from 'ajv';

export function validateBody<T>(ajv: Ajv, schema: AnySchema): RequestHandler {
  const validate = ajv.compile<T>(schema);

  return (req, _res, next) => {
    if (!validate(req.body)) {
      const error = new Error('Request body validation failed');
      (error as any).status = 400;
      (error as any).details = validate.errors;
      return next(error);
    }
    next();
  };
}
