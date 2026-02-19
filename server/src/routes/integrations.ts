import { Router } from 'express';
import Ajv from 'ajv';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { Response } from 'express';
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

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/integrations' });
const integrationFieldSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  key: z.string(),
  type: z.enum(['text', 'textarea']).optional(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
});

const exampleRequestSchema = z
  .object({
    method: z.string(),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
  })
  .nullable()
  .optional();

const exampleResponseSchema = z
  .object({
    incoming: z.record(z.string(), z.string()).optional(),
    outgoing: z.record(z.string(), z.string()).optional(),
  })
  .nullable()
  .optional();

const integrationSchema = z.object({
  id: z.string().uuid().optional(),
  providerId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  organization: z.string().optional(),
  webhookContract: z.string().optional(),
  systemPrompt: z.string().optional(),
  inputFields: z.array(integrationFieldSchema).optional(),
  exampleRequest: exampleRequestSchema,
  exampleResponseMapping: exampleResponseSchema,
  models: z.array(z.string().min(1)).optional(),
  modelsUpdatedAt: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  // Midjourney Discord fields
  discordGuildId: z.string().optional(),
  discordChannelId: z.string().optional(),
  discordUserToken: z.string().optional(),
});

const integrationUpdateSchema = integrationSchema.partial();

type IntegrationPayload = z.infer<typeof integrationSchema>;
type IntegrationUpdatePayload = z.infer<typeof integrationUpdateSchema>;

const modelSyncSchema = z.object({
  provider: z.enum(['replicate', 'openai_gpt', 'google_ai_studio', 'google_gemini', 'google_workspace']),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  organization: z.string().optional(),
  projectId: z.string().optional(),
  location: z.string().optional(),
  selector: z.string().optional(),
  prompt: z.string().optional(),
});

const STORED_API_KEY_SENTINEL = '__USE_STORED_API_KEY__';

function resolveApiKeyFromPayload(candidate: unknown, stored: string): string {
  const trimmedCandidate = typeof candidate === 'string' ? candidate.trim() : '';
  if (!trimmedCandidate || trimmedCandidate === STORED_API_KEY_SENTINEL) {
    return typeof stored === 'string' ? stored.trim() : '';
  }
  return trimmedCandidate;
}

function ensureAuthenticated(req: AuthenticatedRequest): string {
  const userId = req.userId;
  if (!userId) {
    const error = new Error('Authentication required');
    (error as { status?: number }).status = 401;
    throw error;
  }
  return userId;
}

async function fetchReplicateModelsList(baseUrl: string, apiToken: string, limit: number): Promise<string[]> {
  const fetch = (await import('node-fetch')).default;
  const perPage = 100;
  const maxTotal = Math.max(1, Math.min(1000, Number.isFinite(limit) ? Math.trunc(limit) : 200));
  const models: string[] = [];
  const seen = new Set<string>();
  let remaining = maxTotal;
  let safety = 0;
  let pageUrl: URL | null = new URL('/v1/models', baseUrl);
  pageUrl.searchParams.set('limit', String(Math.min(perPage, remaining)));

  while (pageUrl && remaining > 0 && safety < 30) {
    safety += 1;
    const response = await fetch(pageUrl.toString(), {
      headers: {
        Authorization: `Token ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || `Replicate API error (${response.status})`);
      (error as { status?: number }).status = response.status;
      throw error;
    }

    const payload = (await response.json()) as {
      next?: string | null;
      results?: Array<{
        owner?: string | { username?: string; slug?: string; name?: string };
        user?: string;
        name?: string;
        slug?: string;
        latest_version?: { id?: string; version?: string };
        version?: string;
      }>;
    };
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const result of results) {
      const identifier = extractReplicateModelIdentifier(result);
      if (identifier && !seen.has(identifier)) {
        seen.add(identifier);
        models.push(identifier);
        remaining -= 1;
        if (remaining <= 0) {
          break;
        }
      }
    }

    if (remaining <= 0) {
      break;
    }

    const nextUrl = resolveReplicateNextUrl(baseUrl, payload.next ?? null);
    if (!nextUrl) {
      break;
    }

    pageUrl = new URL(nextUrl);
    const nextLimit = Math.min(perPage, remaining);
    if (!pageUrl.searchParams.has('limit') || Number(pageUrl.searchParams.get('limit') ?? nextLimit) > nextLimit) {
      pageUrl.searchParams.set('limit', String(nextLimit));
    }
  }

  return models.sort((a, b) => a.localeCompare(b));
}

function normalizeOpenAiBaseUrl(raw: string | null | undefined): string {
  const fallback = 'https://api.openai.com';
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback;
  }
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, '')}`;
  }
  try {
    const url = new URL(candidate);
    let normalized = url.toString().replace(/\/+$/, '');
    normalized = normalized.replace(/\/v1\/?$/i, '');
    return normalized.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function normalizeGoogleGenerativeBaseUrl(raw: string | null | undefined): string {
  const fallback = 'https://generativelanguage.googleapis.com';
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback;
  }
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, '')}`;
  }
  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function extractGoogleModelIdentifier(model: {
  name?: string;
  displayName?: string;
  version?: string;
}): string | null {
  if (!model) {
    return null;
  }
  const nameCandidate = typeof model.name === 'string' ? model.name.trim() : '';
  if (nameCandidate) {
    const segments = nameCandidate.split('/');
    const selector = segments[segments.length - 1] || nameCandidate;
    return selector.trim() || null;
  }
  const displayCandidate =
    typeof model.displayName === 'string' ? model.displayName.trim() : '';
  if (displayCandidate) {
    return displayCandidate;
  }
  return null;
}

function matchesModelSelector(identifier: string, selector?: string, displayName?: string): boolean {
  if (!selector || selector.trim().length === 0) {
    return true;
  }
  const normalizedSelector = selector.trim().toLowerCase();
  if (identifier.toLowerCase().includes(normalizedSelector)) {
    return true;
  }
  if (displayName && displayName.toLowerCase().includes(normalizedSelector)) {
    return true;
  }
  return false;
}

async function fetchGoogleGenerativeModelsList(options: {
  apiKey: string;
  baseUrl?: string;
  limit?: number;
  selector?: string;
}): Promise<string[]> {
  const fetch = (await import('node-fetch')).default;
  const normalizedBaseUrl = normalizeGoogleGenerativeBaseUrl(
    options.baseUrl ?? process.env.GOOGLE_GENAI_BASE_URL,
  );
  const requestedLimit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.trunc(options.limit)
      : 200;
  const maxTotal = Math.max(1, Math.min(1000, requestedLimit));
  const models: string[] = [];
  const seen = new Set<string>();
  let remaining = maxTotal;
  let nextPageToken: string | undefined;
  let safety = 0;

  while (remaining > 0 && safety < 30) {
    safety += 1;
    const pageSize = Math.min(remaining, 200);
    const url = new URL('/v1beta/models', normalizedBaseUrl);
    url.searchParams.set('key', options.apiKey);
    url.searchParams.set('pageSize', String(pageSize));
    if (nextPageToken) {
      url.searchParams.set('pageToken', nextPageToken);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || `Google Generative API error (${response.status})`);
      (error as { status?: number }).status = response.status;
      throw error;
    }

    const payload = (await response.json()) as {
      models?: Array<{ name?: string; displayName?: string; version?: string }>;
      nextPageToken?: string;
    };
    const items = Array.isArray(payload.models) ? payload.models : [];
    for (const item of items) {
      const identifier = extractGoogleModelIdentifier(item);
      if (!identifier) {
        continue;
      }
      if (!matchesModelSelector(identifier, options.selector, item.displayName)) {
        continue;
      }
      const normalizedIdentifier = identifier.trim();
      if (!normalizedIdentifier || seen.has(normalizedIdentifier)) {
        continue;
      }
      seen.add(normalizedIdentifier);
      models.push(normalizedIdentifier);
      remaining -= 1;
      if (remaining <= 0) {
        break;
      }
    }

    if (!payload.nextPageToken || remaining <= 0) {
      break;
    }
    nextPageToken = payload.nextPageToken;
  }

  return models.sort((a, b) => a.localeCompare(b));
}

function extractReplicateModelIdentifier(model: {
  owner?: string | { username?: string; slug?: string; name?: string };
  user?: string;
  name?: string;
  slug?: string;
  latest_version?: { id?: string; version?: string };
  version?: string;
}): string | null {
  if (!model) {
    return null;
  }
  const ownerCandidate =
    typeof model.owner === 'string'
      ? model.owner
      : model.owner && typeof model.owner === 'object'
        ? model.owner.username || model.owner.slug || model.owner.name || ''
        : '';
  const fallbackOwner = typeof model.user === 'string' ? model.user : '';
  const owner = (ownerCandidate || fallbackOwner || '').trim();
  const nameCandidate = typeof model.name === 'string' ? model.name : '';
  const slugCandidate = typeof model.slug === 'string' ? model.slug : '';
  const name = (nameCandidate || slugCandidate).trim();
  const versionCandidate =
    model.latest_version && typeof model.latest_version.id === 'string'
      ? model.latest_version.id
      : typeof model.version === 'string'
        ? model.version
        : '';
  const version = (versionCandidate || '').trim();
  if (!owner || !name || !version) {
    return null;
  }
  return `${owner}/${name}:${version}`;
}

function resolveReplicateNextUrl(baseUrl: string, next?: string | null): string | null {
  if (!next) {
    return null;
  }
  const trimmed = next.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return null;
    }
  }
}

function ensureDefaultReplicateIntegration(userId: string) {
  const { token } = sanitizeReplicateToken(
    process.env.REPLICATE_API_TOKEN ?? process.env.REPLICATE_TOKEN,
  );
  const baseUrlEnv = process.env.REPLICATE_API_BASE_URL;
  const desiredBaseUrl =
    typeof baseUrlEnv === 'string' && baseUrlEnv.trim().length > 0
      ? normalizeReplicateBaseUrl(baseUrlEnv)
      : 'https://api.replicate.com';

  const existing = getIntegrationForUserByProvider('replicate', userId);
  if (!existing) {
    return;
  }

  const updates: Partial<IntegrationConfig> = {};
  let shouldUpdate = false;
  let enabled = existing.enabled;

  if (token && token !== existing.config.apiKey?.trim()) {
    updates.apiKey = token;
    enabled = true;
    shouldUpdate = true;
  }

  if (!existing.config.baseUrl) {
    updates.baseUrl = desiredBaseUrl;
    shouldUpdate = true;
  }

  if (!Array.isArray(existing.config.models)) {
    updates.models = [];
    shouldUpdate = true;
  }

  if (shouldUpdate) {
    updateIntegration(existing.id, userId, {
      config: updates,
      enabled,
    });
  }
}

export function createIntegrationsRouter(_ajv: Ajv): Router {
  const router = Router();

  // GET /integrations/google/models - List Google Gemini models (MUST be before /:id route)
  router.get('/google/models', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId; // Optional - can work without auth
      let apiKey = '';

      if (userId) {
        const candidates = [
          getIntegrationForUserByProvider('google_ai_studio', userId),
          getIntegrationForUserByProvider('google_gemini', userId),
          getIntegrationForUserByProvider('google_workspace', userId),
        ];
        const active = candidates.find(
          (integration): integration is NonNullable<typeof integration> =>
            Boolean(integration && integration.enabled),
        );
        if (active) {
          apiKey = active.config.apiKey?.trim() ?? '';
        }
      }

      if (!apiKey) {
        apiKey = 'AIzaSyA1okdJXjSDKAKSoPPKmx_UIq7r0STcT8U';
        log.info('🔧 Using fallback Google API key for development');
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) {
        const errorText = await response.text();
        log.error({ detail: errorText }, 'Failed to fetch Google models');
        res.status(response.status).json({ error: `Failed to fetch models from Google: ${errorText}` });
        return;
      }

      const data = await response.json();
      const models = Array.isArray((data as any).models)
        ? (data as any).models
            .filter(
              (model: any) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'),
            )
            .map((model: any) => String(model.name ?? '').replace(/^models\//, ''))
        : [];

      res.json({ models });
    } catch (error) {
      log.error({ err: error }, 'Error fetching Google models');
      res.status(500).json({ error: 'Internal server error while fetching Google models.' });
    }
  });

  // GET /integrations/openai/models - List OpenAI models (MUST be before /:id route)
  router.get('/openai/models', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId; // Optional - can work without auth
      let apiKey = '';

      if (userId) {
        const candidates = [
          getIntegrationForUserByProvider('openai_gpt', userId),
          getIntegrationForUserByProvider('openai_chat', userId),
        ];
        const active = candidates.find(
          (integration): integration is NonNullable<typeof integration> =>
            Boolean(integration && integration.enabled),
        );
        if (active) {
          apiKey = active.config.apiKey?.trim() ?? '';
          if (!apiKey) {
            // Some legacy configs may store organization object with embedded key
            const extra = active.config.extra;
            if (extra && typeof extra === 'object') {
              const raw = (extra as Record<string, unknown>).apiKey;
              if (typeof raw === 'string' && raw.trim().length > 0) {
                apiKey = raw.trim();
              }
            }
          }
        }
      }

      if (!apiKey) {
        log.info('⚠️ No OpenAI API key found, returning fallback models list');
        res.json({
          models: ['chatgpt-4o-latest', 'gpt-4o-mini', 'gpt-3.5-turbo'], // Минимальный список для тестирования
        });
        return;
      }

      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ detail: errorText }, 'Failed to fetch OpenAI models');
        res.status(response.status).json({ error: `Failed to fetch models from OpenAI: ${errorText}` });
        return;
      }

      const data = await response.json();
      const models = Array.isArray((data as any).data)
        ? (data as any).data
            .filter(
              (model: any) =>
                typeof model.id === 'string' && model.id.includes('gpt') && !model.id.includes('instruct') && !model.id.includes('embed'),
            )
            .map((model: any) => model.id)
        : [];

      res.json({ models });
    } catch (error) {
      log.error({ err: error }, 'Error fetching OpenAI models');
      res.status(500).json({ error: 'Internal server error while fetching OpenAI models.' });
    }
  });

  // Get model information endpoint - using query parameter to avoid URL encoding issues
  router.get('/models/:provider/info', async (req: AuthenticatedRequest, res) => {
    try {
      const { provider } = req.params;
      const modelId = req.query.modelId as string;
      const userId = req.userId!;
      
      log.info({ data: { provider, modelId, query: req.query } }, 'Model info request');

      if (!modelId) {
        res.status(400).json({ error: 'modelId query parameter is required' });
        return;
      }

      // Validate provider and normalize it
      let normalizedProvider = provider;
      if (provider.includes('google')) normalizedProvider = 'google';
      else if (provider.includes('openai')) normalizedProvider = 'openai';
      else if (provider.includes('anthropic')) normalizedProvider = 'anthropic';
      else if (provider.includes('midjourney')) normalizedProvider = 'midjourney';
      
      const validProviders = ['replicate', 'openai', 'google', 'anthropic', 'midjourney'];
      if (!validProviders.includes(normalizedProvider)) {
        res.status(400).json({ error: `Unsupported provider: ${provider}` });
        return;
      }

      // For Replicate, we need API token from user's integration or query parameter
      let apiToken: string | undefined;
      if (normalizedProvider === 'replicate') {
        // Try to get from query parameter first
        apiToken = req.query.apiToken as string | undefined;
        
        if (!apiToken) {
          log.info('No API token in query, trying integration for user %s', userId);
          try {
            const integration = getIntegrationForUserByProvider('replicate', userId);
            if (integration && integration.config && integration.config.apiKey) {
              apiToken = integration.config.apiKey as string;
              log.info('Found API token from integration');
            }
          } catch (error) {
            log.info({ err: error }, 'Error getting integration');
          }
        }
        
        if (!apiToken) {
          log.info('No Replicate API token found');
          res.status(400).json({ 
            error: 'Replicate API token required. Please configure Replicate integration or provide apiToken parameter.' 
          });
          return;
        }
        log.info('Using API token for Replicate');
      }

      // Get model info
      log.info({ data: { provider: normalizedProvider, modelId, hasToken: !!apiToken } }, 'Calling getModelInfo with');
      const modelInfo = await getModelInfo(
        normalizedProvider as 'replicate' | 'openai' | 'google' | 'anthropic' | 'midjourney',
        modelId,
        apiToken
      );
      log.info('Got model info %s', modelInfo ? 'YES' : 'NO');

      res.json(modelInfo);
    } catch (error: any) {
      log.error({ err: error }, '`Failed to get model info:`');
      res.status(500).json({ error: error.message || 'Failed to get model information' });
    }
  });

  router.get('/', (req, res) => {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      ensureDefaultReplicateIntegration(userId);
      const integrations = listIntegrationsForUser(userId).map(toIntegrationResponse);
      res.json(integrations);
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch global integrations');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to fetch global integrations' });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const integration = getIntegrationForUserById(req.params.id, userId);
      if (!integration) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }
      res.json(toIntegrationResponse(integration));
    } catch (error) {
      log.error({ err: error }, '`Failed to fetch integration ${req.params.id}:`');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to fetch global integration' });
    }
  });

  router.post('/', (req, res) => {
    log.info('[integrations POST] Request received');
    try {
      log.info('[integrations POST] Authenticating user');
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      log.info('[integrations POST] User authenticated %s', userId);
      
      const payload = integrationSchema.parse(req.body);
      log.info({ data: { providerId: payload.providerId, name: payload.name } }, '[integrations POST] Payload parsed');
      
      // Allow multiple integrations for the same provider
      // Users may have multiple accounts (e.g., two Replicate accounts with different API keys)
      // No duplicate check needed - each integration has unique ID
      
      log.info('[integrations POST] Building config patch');
      const patch = buildIntegrationConfigPatch(payload, payload.providerId);
      log.info('[integrations POST] Calling createIntegration');
      const record = createIntegration({
        id: payload.id,
        userId,
        providerId: payload.providerId,
        name: payload.name,
        config: patch.config,
        enabled: patch.enabled ?? payload.enabled ?? true,
      });
      log.info('[integrations POST] Successfully created %s', record.id);
      res.status(201).json(toIntegrationResponse(record));
    } catch (error) {
      log.error({ err: error }, '[integrations POST] Exception caught');
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ detail: errorMessage }, '[integrations POST] Error message');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: `Failed to create global integration: ${errorMessage}` });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const payload = integrationUpdateSchema.parse(req.body ?? {});
      const existing = getIntegrationForUserById(req.params.id, userId);
      if (!existing) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }

      if (
        payload.providerId &&
        payload.providerId.trim() &&
        payload.providerId.trim() !== existing.providerId
      ) {
        res.status(400).json({ error: 'Changing providerId is not supported' });
        return;
      }

      const patch = buildIntegrationConfigPatch(payload, existing.providerId, existing);
      const hasConfigChanges = Object.keys(patch.config).length > 0;
      const updated = updateIntegration(existing.id, userId, {
        name: payload.name?.trim(),
        config: hasConfigChanges ? patch.config : undefined,
        enabled: patch.enabled,
      });
      res.json(toIntegrationResponse(updated));
    } catch (error) {
      log.error({ err: error }, '`Failed to update integration ${req.params.id}:`');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to update global integration' });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const removed = deleteIntegration(req.params.id, userId);
      if (!removed) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      log.error({ err: error }, '`Failed to delete integration ${req.params.id}:`');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to delete global integration' });
    }
  });

  router.post('/:id/models/sync', async (req, res) => {
    try {
      const userId = ensureAuthenticated(req as AuthenticatedRequest);
      const integration = getIntegrationForUserById(req.params.id, userId);
      if (!integration) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }

      const payload = modelSyncSchema.parse({ provider: integration.providerId, ...(req.body ?? {}) });

      switch (integration.providerId) {
        case 'replicate': {
          const providedToken = resolveApiKeyFromPayload(payload.apiKey, integration.config.apiKey);
          const { token, isPlaceholder } = sanitizeReplicateToken(providedToken);
          if (!token || isPlaceholder) {
            res.status(400).json({ error: 'Provide a valid Replicate API token to sync models' });
            return;
          }
          const baseUrl =
            payload.baseUrl?.trim() ||
            integration.config.baseUrl ||
            process.env.REPLICATE_API_BASE_URL ||
            'https://api.replicate.com';
          const normalizedBaseUrl = normalizeReplicateBaseUrl(baseUrl);
          const limit = payload.limit ?? 200;

          const models = await fetchReplicateModelsList(normalizedBaseUrl, token, limit);
          const updated = updateIntegration(integration.id, userId, {
            config: {
              apiKey: token,
              baseUrl: normalizedBaseUrl,
              models,
              modelsUpdatedAt: new Date().toISOString(),
            },
            enabled: true,
          });

          res.json({
            provider: integration.providerId,
            models,
            count: models.length,
            updatedAt: updated.config.modelsUpdatedAt,
            baseUrl: normalizedBaseUrl,
            integration: toIntegrationResponse(updated),
          });
          log.info('[Integrations] OpenAI sync response sent');
          return;
        }
        case 'openai_gpt': {
          const apiKey = resolveApiKeyFromPayload(payload.apiKey, integration.config.apiKey);
          if (!apiKey) {
            res.status(400).json({ error: 'Provide a valid OpenAI API key to sync models' });
            return;
          }
          const baseUrlCandidate =
            payload.baseUrl?.trim() ||
            integration.config.baseUrl ||
            process.env.OPENAI_API_BASE_URL ||
            'https://api.openai.com';
          const normalizedBaseUrl = normalizeOpenAiBaseUrl(baseUrlCandidate);
          const organizationCandidate =
            payload.organization !== undefined
              ? payload.organization
              : integration.config.organization ||
                process.env.OPENAI_ORGANIZATION ||
                process.env.OPENAI_ORG_ID;
          const organization =
            typeof organizationCandidate === 'string' ? organizationCandidate.trim() : '';
          const limit =
            typeof payload.limit === 'number' && Number.isFinite(payload.limit)
              ? Math.max(1, Math.min(1000, Math.trunc(payload.limit)))
              : 200;

          const summaries = await listOpenAiModels(apiKey, {
            baseUrl: normalizedBaseUrl,
            organization: organization || undefined,
          });
          const deduped = Array.from(
            new Set(
              summaries
                .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
                .filter((id) => id.length > 0),
            ),
          );
          const models = deduped
            .sort((a, b) => a.localeCompare(b))
            .slice(0, limit);

          const configPatch: Partial<IntegrationConfig> = {
            apiKey,
            baseUrl: normalizedBaseUrl,
            models,
            modelsUpdatedAt: new Date().toISOString(),
          };
          if (payload.organization !== undefined || organization.length > 0) {
            configPatch.organization = organization;
          }

          const updated = updateIntegration(integration.id, userId, {
            config: configPatch,
            enabled: true,
          });

          res.json({
            provider: integration.providerId,
            models,
            count: models.length,
            updatedAt: updated.config.modelsUpdatedAt,
            baseUrl: normalizedBaseUrl,
            integration: toIntegrationResponse(updated),
          });
          return;
        }
        case 'google_ai_studio':
        case 'google_gemini':
        case 'google_workspace': {
          const apiKey = resolveApiKeyFromPayload(payload.apiKey, integration.config.apiKey);
          if (!apiKey) {
            res.status(400).json({ error: 'Provide a valid Google API key to sync models' });
            return;
          }

          const baseUrlCandidate =
            payload.baseUrl?.trim() ||
            integration.config.baseUrl ||
            process.env.GOOGLE_GENAI_BASE_URL ||
            'https://generativelanguage.googleapis.com';
          const normalizedBaseUrl = normalizeGoogleGenerativeBaseUrl(baseUrlCandidate);
          const models = await fetchGoogleGenerativeModelsList({
            apiKey,
            baseUrl: normalizedBaseUrl,
            limit: payload.limit,
            selector: payload.selector,
          });

          const updated = updateIntegration(integration.id, userId, {
            config: {
              apiKey,
              baseUrl: normalizedBaseUrl,
              models,
              modelsUpdatedAt: new Date().toISOString(),
            },
            enabled: true,
          });

          res.json({
            provider: integration.providerId,
            models,
            count: models.length,
            updatedAt: updated.config.modelsUpdatedAt,
            baseUrl: normalizedBaseUrl,
            integration: toIntegrationResponse(updated),
          });
          return;
        }
        default: {
          res.status(400).json({ error: `Model sync is not yet implemented for ${integration.providerId}` });
          return;
        }
      }
    } catch (error) {
      log.error({ err: error }, '`Failed to sync models for integration ${req.params.id}:`');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to sync models' });
    }
  });

  // GET /integrations/:id/set-default - Set integration as default
  router.put('/:id/set-default', (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = ensureAuthenticated(req);
      const integration = getIntegrationForUserById(req.params.id, userId);
      
      if (!integration) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }

      // Mark this integration as default and unset others of the same provider type
      const db = (req.app.locals.db as Database.Database);
      
      // Unset all default integrations for this provider type
      db.prepare(`
        UPDATE global_integrations 
        SET is_default = 0 
        WHERE user_id = ? AND type = ?
      `).run(userId, integration.providerId);
      
      // Set this one as default
      db.prepare(`
        UPDATE global_integrations 
        SET is_default = 1 
        WHERE integration_id = ?
      `).run(req.params.id);
      
      const updated = getIntegrationForUserById(req.params.id, userId);
      res.json(toIntegrationResponse(updated!));
    } catch (error) {
      log.error({ err: error }, '`Failed to set default integration ${req.params.id}:`');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to set default integration' });
    }
  });

  // GET /integrations/provider/:type/default - Get default integration for provider type
  router.get('/provider/:type/default', (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = ensureAuthenticated(req);
      const providerType = req.params.type;

      const integrations = listIntegrationsForUser(userId).filter(
        (integration) => integration.providerId === providerType,
      );
      const defaultIntegration = integrations.find((integration) => integration.isDefault);

      if (!defaultIntegration) {
        res.status(404).json({ error: 'No default integration found for this provider' });
        return;
      }

      const { extra, ...normalizedConfig } = defaultIntegration.config;
      const configPayload: Record<string, unknown> = {
        ...(extra && typeof extra === 'object' ? extra : {}),
        ...normalizedConfig,
      };

      res.json({
        id: defaultIntegration.id,
        type: defaultIntegration.providerId,
        name: defaultIntegration.name,
        config: configPayload,
        enabled: defaultIntegration.enabled,
        isDefault: true,
      });
    } catch (error) {
      log.error({ err: error }, '`Failed to get default integration for ${req.params.type}:`');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to get default integration' });
    }
  });

  // GET /integrations/:integrationId/models/:modelId/info - Get model information
  router.get('/:integrationId/models/:modelId/info', (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = ensureAuthenticated(req);
      const integration = getIntegrationForUserById(req.params.integrationId, userId);
      
      if (!integration) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }

      const modelId = decodeURIComponent(req.params.modelId);
      const providerType = integration.providerId;
      const apiKey = integration.config?.apiKey as string | undefined;

      // Get model info asynchronously
      void (async () => {
        try {
          const modelInfo = await getModelInfo(
            providerType as 'replicate' | 'openai' | 'google' | 'anthropic',
            modelId,
            apiKey
          );
          res.json(modelInfo);
        } catch (error) {
          log.error({ err: error }, '`Failed to get model info for ${modelId}:`');
          res
            .status((error as { status?: number }).status ?? 500)
            .json({ error: 'Failed to get model information' });
        }
      })();
    } catch (error) {
      log.error({ err: error }, '`Failed to get model info ${req.params.modelId}:`');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to get model information' });
    }
  });

  return router;
}
