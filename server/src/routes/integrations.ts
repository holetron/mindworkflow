import { Router } from 'express';
import Ajv from 'ajv';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { integrationsController } from '../controllers/integrationsController';

export function createIntegrationsRouter(_ajv: Ajv): Router {
  const router = Router();

  // GET /integrations/google/models - List Google Gemini models (MUST be before /:id route)
  router.get('/google/models', (req: AuthenticatedRequest, res: Response) =>
    integrationsController.getGoogleModels(req, res));

  // GET /integrations/openai/models - List OpenAI models (MUST be before /:id route)
  router.get('/openai/models', (req: AuthenticatedRequest, res: Response) =>
    integrationsController.getOpenaiModels(req, res));

  // Get model information endpoint - using query parameter to avoid URL encoding issues
  router.get('/models/:provider/info', (req: AuthenticatedRequest, res: Response) =>
    integrationsController.getModelInfo(req, res));

  // GET /integrations/provider/:type/default - Get default integration for provider type
  router.get('/provider/:type/default', (req: AuthenticatedRequest, res: Response) =>
    integrationsController.getProviderDefault(req, res));

  // CRUD routes
  router.get('/', integrationsController.list);
  router.get('/:id', integrationsController.getById);
  router.post('/', integrationsController.create);
  router.put('/:id', integrationsController.update);
  router.delete('/:id', integrationsController.remove);

  // Model sync
  router.post('/:id/models/sync', integrationsController.syncModels);

  // Set default integration
  router.put('/:id/set-default', (req: AuthenticatedRequest, res: Response) =>
    integrationsController.setDefault(req, res));

  // GET /integrations/:integrationId/models/:modelId/info - Get model information
  router.get('/:integrationId/models/:modelId/info', (req: AuthenticatedRequest, res: Response) =>
    integrationsController.getIntegrationModelInfo(req, res));

  return router;
}
