import { Router } from 'express';
import Ajv, { JSONSchemaType } from 'ajv';
import { validateBody } from '../middleware/validateBody';

interface ValidateRequest {
  schema_ref: string;
  data: unknown;
}

export function createValidateRouter(ajv: Ajv): Router {
  const router = Router();

  const schema = {
    type: 'object',
    required: ['schema_ref', 'data'],
    additionalProperties: false,
    properties: {
      schema_ref: { type: 'string', minLength: 1 },
      data: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
    },
  } as unknown as JSONSchemaType<ValidateRequest>;

  router.post('/', validateBody<ValidateRequest>(ajv, schema), (req, res, next) => {
    try {
      const { schema_ref, data } = req.body as ValidateRequest;
      const validator = ajv.getSchema(schema_ref) ?? ajv.getSchema(schema_ref.toUpperCase());
      if (!validator) {
        const err = new Error(`Schema '${schema_ref}' not found`);
        (err as any).status = 404;
        throw err;
      }
      const valid = validator(data);
      res.json({ valid, errors: valid ? [] : validator.errors });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
