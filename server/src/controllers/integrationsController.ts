import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  createIntegration,
  deleteIntegration,
  getIntegrationForUserById,
  getIntegrationForUserByProvider,
  listIntegrationsForUser,
  updateIntegration,
} from '../services/integrationRepository';
import { IntegrationConfig } from '../types/integration';
import {
  buildIntegrationConfigPatch,
  normalizeReplicateBaseUrl,
  sanitizeReplicateToken,
  toIntegrationResponse,
} from '../services/integrationUtils';
import { listOpenAiModels } from '../services/openAi';
import { getModelInfo } from '../services/modelInfo';
import {
  resolveApiKeyFromPayload,
  fetchReplicateModelsList,
  normalizeOpenAiBaseUrl,
  normalizeGoogleGenerativeBaseUrl,
  fetchGoogleGenerativeModelsList,
  ensureDefaultReplicateIntegration,
} from './integrationsHelpers';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'controllers/integrations' });

// --- Zod schemas ---

const integrationFieldSchema = z.object({
  id: z.string().optional(), label: z.string(), key: z.string(),
  type: z.enum(['text', 'textarea']).optional(), placeholder: z.string().optional(),
  description: z.string().optional(), required: z.boolean().optional(), defaultValue: z.string().optional(),
});

const exampleRequestSchema = z.object({
  method: z.string(), url: z.string(),
  headers: z.record(z.string(), z.string()).optional(), body: z.string().optional(),
}).nullable().optional();

const exampleResponseSchema = z.object({
  incoming: z.record(z.string(), z.string()).optional(),
  outgoing: z.record(z.string(), z.string()).optional(),
}).nullable().optional();

export const integrationSchema = z.object({
  id: z.string().uuid().optional(), providerId: z.string().min(1), name: z.string().min(1),
  description: z.string().optional(), apiKey: z.string().optional(), baseUrl: z.string().optional(),
  organization: z.string().optional(), webhookContract: z.string().optional(),
  systemPrompt: z.string().optional(), inputFields: z.array(integrationFieldSchema).optional(),
  exampleRequest: exampleRequestSchema, exampleResponseMapping: exampleResponseSchema,
  models: z.array(z.string().min(1)).optional(), modelsUpdatedAt: z.string().optional().nullable(),
  enabled: z.boolean().optional(), extra: z.record(z.string(), z.unknown()).optional(),
  discordGuildId: z.string().optional(), discordChannelId: z.string().optional(),
  discordUserToken: z.string().optional(),
});

export const integrationUpdateSchema = integrationSchema.partial();

export const modelSyncSchema = z.object({
  provider: z.enum(['replicate', 'openai_gpt', 'google_ai_studio', 'google_gemini', 'google_workspace']),
  apiKey: z.string().optional(), baseUrl: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(), organization: z.string().optional(),
  projectId: z.string().optional(), location: z.string().optional(),
  selector: z.string().optional(), prompt: z.string().optional(),
});

function ensureAuthenticated(req: AuthenticatedRequest): string {
  const userId = req.userId;
  if (!userId) { const e = new Error('Authentication required'); (e as any).status = 401; throw e; }
  return userId;
}

// --- Controller ---

export const integrationsController = {
  async getGoogleModels(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      let apiKey = '';
      if (userId) {
        const candidates = [
          getIntegrationForUserByProvider('google_ai_studio', userId),
          getIntegrationForUserByProvider('google_gemini', userId),
          getIntegrationForUserByProvider('google_workspace', userId),
        ];
        const active = candidates.find((i): i is NonNullable<typeof i> => Boolean(i && i.enabled));
        if (active) apiKey = active.config.apiKey?.trim() ?? '';
      }
      if (!apiKey) {
        throw new Error('Google API key not configured. Set GOOGLE_API_KEY in environment variables.');
      }
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) { const t = await response.text(); res.status(response.status).json({ error: `Failed: ${t}` }); return; }
      const data = await response.json();
      const models = Array.isArray((data as any).models)
        ? (data as any).models.filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent')).map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
        : [];
      res.json({ models });
    } catch (error) { log.error({ err: error }, 'Error fetching Google models'); res.status(500).json({ error: 'Internal error' }); }
  },

  async getOpenaiModels(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId;
      let apiKey = '';
      if (userId) {
        const candidates = [getIntegrationForUserByProvider('openai_gpt', userId), getIntegrationForUserByProvider('openai_chat', userId)];
        const active = candidates.find((i): i is NonNullable<typeof i> => Boolean(i && i.enabled));
        if (active) {
          apiKey = active.config.apiKey?.trim() ?? '';
          if (!apiKey) { const extra = active.config.extra; if (extra && typeof extra === 'object') { const raw = (extra as Record<string, unknown>).apiKey; if (typeof raw === 'string' && raw.trim().length > 0) apiKey = raw.trim(); } }
        }
      }
      if (!apiKey) { res.json({ models: ['chatgpt-4o-latest', 'gpt-4o-mini', 'gpt-3.5-turbo'] }); return; }
      const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
      if (!response.ok) { const t = await response.text(); res.status(response.status).json({ error: `Failed: ${t}` }); return; }
      const data = await response.json();
      const models = Array.isArray((data as any).data) ? (data as any).data.filter((m: any) => typeof m.id === 'string' && m.id.includes('gpt') && !m.id.includes('instruct') && !m.id.includes('embed')).map((m: any) => m.id) : [];
      res.json({ models });
    } catch (error) { log.error({ err: error }, 'Error fetching OpenAI models'); res.status(500).json({ error: 'Internal error' }); }
  },

  async getModelInfo(req: AuthenticatedRequest, res: Response) {
    try {
      const { provider } = req.params; const modelId = req.query.modelId as string; const userId = req.userId!;
      if (!modelId) { res.status(400).json({ error: 'modelId query parameter is required' }); return; }
      let np = provider;
      if (provider.includes('google')) np = 'google'; else if (provider.includes('openai')) np = 'openai';
      else if (provider.includes('anthropic')) np = 'anthropic'; else if (provider.includes('midjourney')) np = 'midjourney';
      if (!['replicate', 'openai', 'google', 'anthropic', 'midjourney'].includes(np)) { res.status(400).json({ error: `Unsupported provider: ${provider}` }); return; }
      let apiToken: string | undefined;
      if (np === 'replicate') {
        apiToken = req.query.apiToken as string | undefined;
        if (!apiToken) { try { const i = getIntegrationForUserByProvider('replicate', userId); if (i?.config?.apiKey) apiToken = i.config.apiKey as string; } catch {} }
        if (!apiToken) { res.status(400).json({ error: 'Replicate API token required.' }); return; }
      }
      const info = await getModelInfo(np as any, modelId, apiToken);
      res.json(info);
    } catch (error: any) { res.status(500).json({ error: error.message || 'Failed to get model information' }); }
  },

  list(req: Request, res: Response) {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      ensureDefaultReplicateIntegration(userId);
      res.json(listIntegrationsForUser(userId).map(toIntegrationResponse));
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to fetch integrations' }); }
  },

  getById(req: Request, res: Response) {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const i = getIntegrationForUserById(req.params.id, userId);
      if (!i) { res.status(404).json({ error: 'Integration not found' }); return; }
      res.json(toIntegrationResponse(i));
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to fetch integration' }); }
  },

  create(req: Request, res: Response) {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const payload = integrationSchema.parse(req.body);
      const patch = buildIntegrationConfigPatch(payload, payload.providerId);
      const record = createIntegration({ id: payload.id, userId, providerId: payload.providerId, name: payload.name, config: patch.config, enabled: patch.enabled ?? payload.enabled ?? true });
      res.status(201).json(toIntegrationResponse(record));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status((error as any).status ?? 500).json({ error: `Failed to create integration: ${msg}` });
    }
  },

  update(req: Request, res: Response) {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const payload = integrationUpdateSchema.parse(req.body ?? {});
      const existing = getIntegrationForUserById(req.params.id, userId);
      if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }
      if (payload.providerId && payload.providerId.trim() && payload.providerId.trim() !== existing.providerId) { res.status(400).json({ error: 'Changing providerId is not supported' }); return; }
      const patch = buildIntegrationConfigPatch(payload, existing.providerId, existing);
      const updated = updateIntegration(existing.id, userId, { name: payload.name?.trim(), config: Object.keys(patch.config).length > 0 ? patch.config : undefined, enabled: patch.enabled });
      res.json(toIntegrationResponse(updated));
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to update integration' }); }
  },

  remove(req: Request, res: Response) {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const removed = deleteIntegration(req.params.id, userId);
      if (!removed) { res.status(404).json({ error: 'Integration not found' }); return; }
      res.status(204).send();
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to delete integration' }); }
  },

  async syncModels(req: Request, res: Response) {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const integration = getIntegrationForUserById(req.params.id, userId);
      if (!integration) { res.status(404).json({ error: 'Integration not found' }); return; }
      const payload = modelSyncSchema.parse({ provider: integration.providerId, ...(req.body ?? {}) });

      switch (integration.providerId) {
        case 'replicate': {
          const providedToken = resolveApiKeyFromPayload(payload.apiKey, integration.config.apiKey);
          const { token, isPlaceholder } = sanitizeReplicateToken(providedToken);
          if (!token || isPlaceholder) { res.status(400).json({ error: 'Provide a valid Replicate API token' }); return; }
          const baseUrl = normalizeReplicateBaseUrl(payload.baseUrl?.trim() || integration.config.baseUrl || process.env.REPLICATE_API_BASE_URL || 'https://api.replicate.com');
          const models = await fetchReplicateModelsList(baseUrl, token, payload.limit ?? 200);
          const updated = updateIntegration(integration.id, userId, { config: { apiKey: token, baseUrl, models, modelsUpdatedAt: new Date().toISOString() }, enabled: true });
          res.json({ provider: integration.providerId, models, count: models.length, updatedAt: updated.config.modelsUpdatedAt, baseUrl, integration: toIntegrationResponse(updated) });
          return;
        }
        case 'openai_gpt': {
          const apiKey = resolveApiKeyFromPayload(payload.apiKey, integration.config.apiKey);
          if (!apiKey) { res.status(400).json({ error: 'Provide a valid OpenAI API key' }); return; }
          const baseUrl = normalizeOpenAiBaseUrl(payload.baseUrl?.trim() || integration.config.baseUrl || process.env.OPENAI_API_BASE_URL || 'https://api.openai.com');
          const orgCand = payload.organization !== undefined ? payload.organization : integration.config.organization || process.env.OPENAI_ORGANIZATION || process.env.OPENAI_ORG_ID;
          const org = typeof orgCand === 'string' ? orgCand.trim() : '';
          const limit = typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? Math.max(1, Math.min(1000, Math.trunc(payload.limit))) : 200;
          const summaries = await listOpenAiModels(apiKey, { baseUrl, organization: org || undefined });
          const models = Array.from(new Set(summaries.map(i => typeof i.id === 'string' ? i.id.trim() : '').filter(id => id.length > 0))).sort().slice(0, limit);
          const configPatch: Partial<IntegrationConfig> = { apiKey, baseUrl, models, modelsUpdatedAt: new Date().toISOString() };
          if (payload.organization !== undefined || org.length > 0) configPatch.organization = org;
          const updated = updateIntegration(integration.id, userId, { config: configPatch, enabled: true });
          res.json({ provider: integration.providerId, models, count: models.length, updatedAt: updated.config.modelsUpdatedAt, baseUrl, integration: toIntegrationResponse(updated) });
          return;
        }
        case 'google_ai_studio': case 'google_gemini': case 'google_workspace': {
          const apiKey = resolveApiKeyFromPayload(payload.apiKey, integration.config.apiKey);
          if (!apiKey) { res.status(400).json({ error: 'Provide a valid Google API key' }); return; }
          const baseUrl = normalizeGoogleGenerativeBaseUrl(payload.baseUrl?.trim() || integration.config.baseUrl || process.env.GOOGLE_GENAI_BASE_URL || 'https://generativelanguage.googleapis.com');
          const models = await fetchGoogleGenerativeModelsList({ apiKey, baseUrl, limit: payload.limit, selector: payload.selector });
          const updated = updateIntegration(integration.id, userId, { config: { apiKey, baseUrl, models, modelsUpdatedAt: new Date().toISOString() }, enabled: true });
          res.json({ provider: integration.providerId, models, count: models.length, updatedAt: updated.config.modelsUpdatedAt, baseUrl, integration: toIntegrationResponse(updated) });
          return;
        }
        default: res.status(400).json({ error: `Model sync not implemented for ${integration.providerId}` }); return;
      }
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to sync models' }); }
  },

  setDefault(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = ensureAuthenticated(req);
      const i = getIntegrationForUserById(req.params.id, userId);
      if (!i) { res.status(404).json({ error: 'Integration not found' }); return; }
      const database = (req.app.locals.db as Database.Database);
      database.prepare(`UPDATE global_integrations SET is_default = 0 WHERE user_id = ? AND type = ?`).run(userId, i.providerId);
      database.prepare(`UPDATE global_integrations SET is_default = 1 WHERE integration_id = ?`).run(req.params.id);
      res.json(toIntegrationResponse(getIntegrationForUserById(req.params.id, userId)!));
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to set default' }); }
  },

  getProviderDefault(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = ensureAuthenticated(req);
      const integrations = listIntegrationsForUser(userId).filter(i => i.providerId === req.params.type);
      const def = integrations.find(i => i.isDefault);
      if (!def) { res.status(404).json({ error: 'No default integration found' }); return; }
      const { extra, ...normalizedConfig } = def.config;
      res.json({ id: def.id, type: def.providerId, name: def.name, config: { ...(extra && typeof extra === 'object' ? extra : {}), ...normalizedConfig }, enabled: def.enabled, isDefault: true });
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to get default' }); }
  },

  getIntegrationModelInfo(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = ensureAuthenticated(req);
      const i = getIntegrationForUserById(req.params.integrationId, userId);
      if (!i) { res.status(404).json({ error: 'Integration not found' }); return; }
      const modelId = decodeURIComponent(req.params.modelId);
      void (async () => {
        try { res.json(await getModelInfo(i.providerId as any, modelId, i.config?.apiKey as string | undefined)); }
        catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to get model info' }); }
      })();
    } catch (error) { res.status((error as any).status ?? 500).json({ error: 'Failed to get model info' }); }
  },
};
