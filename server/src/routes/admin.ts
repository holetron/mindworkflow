import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  PromptPresetCategory,
  PromptPresetCreateInput,
  PromptPresetImportInput,
  PromptPresetUpdateInput,
  createPromptPreset,
  deletePromptPreset,
  deleteUserCascade,
  listAdminProjects,
  listAdminUsers,
  listPromptPresetsForAdmin,
  listFeedbackEntries,
  getFeedbackEntry,
  updateFeedbackEntry,
  deleteFeedbackEntry,
  updateProjectOwner,
  updatePromptPreset,
  importPromptPresets,
  updateUserRecord,
  updateUserPassword,
  db,
} from '../db';
import { applyEmailSettings, getEmailSettingsSummary, emailService } from '../services/email';
import { upsertEnvVariables } from '../utils/envWriter';
import {
  listAllIntegrations,
  listIntegrationsForUser,
  getIntegrationById,
  getIntegrationForUserByProvider,
  createIntegration as createGlobalIntegration,
  updateIntegration as updateGlobalIntegration,
  deleteIntegration as deleteGlobalIntegration,
} from '../services/integrationRepository';
import { buildIntegrationConfigPatch, toIntegrationResponse } from '../services/integrationUtils';
import { UiSettingsScope, getUiSettings, updateUiSettings } from '../services/uiSettings';
import { uiSettingsSchema } from '../validation/uiSettings';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/admin' });
interface UserUpdateRequest {
  email?: string;
  name?: string;
  is_admin?: boolean;
  password?: string;
}

interface EmailConfigRequest {
  gmailUser?: string;
  gmailAppPassword?: string;
  frontendUrl?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

interface PromptPresetRequestBody {
  category?: string;
  label?: string;
  description?: string | null;
  content?: string;
  tags?: unknown;
  is_quick_access?: unknown;
  sort_order?: unknown;
}

interface PromptPresetImportRequest {
  prompts?: PromptPresetImportInput[];
  mode?: 'append' | 'replace';
}

const adminIntegrationFieldSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  key: z.string(),
  type: z.enum(['text', 'textarea']).optional(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
});

const adminIntegrationExampleRequestSchema = z
  .object({
    method: z.string(),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
  })
  .nullable()
  .optional();

const adminIntegrationExampleResponseSchema = z
  .object({
    incoming: z.record(z.string(), z.string()).optional(),
    outgoing: z.record(z.string(), z.string()).optional(),
  })
  .nullable()
  .optional();

const adminIntegrationCreateSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  providerId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  organization: z.string().optional(),
  webhookContract: z.string().optional(),
  systemPrompt: z.string().optional(),
  inputFields: z.array(adminIntegrationFieldSchema).optional(),
  exampleRequest: adminIntegrationExampleRequestSchema,
  exampleResponseMapping: adminIntegrationExampleResponseSchema,
  models: z.array(z.string().min(1)).optional(),
  modelsUpdatedAt: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

const adminIntegrationUpdateSchema = adminIntegrationCreateSchema.partial().extend({
  userId: z.string().uuid().optional(),
});

const PROMPT_PRESET_CATEGORIES: PromptPresetCategory[] = ['system_prompt', 'output_example'];

const FEEDBACK_STATUS_VALUES = ['new', 'in_progress', 'resolved', 'archived'] as const;

const feedbackStatusSchema = z.enum(FEEDBACK_STATUS_VALUES);

const feedbackUpdateSchema = z
  .object({
    title: z.string().max(240).optional(),
    description: z.string().max(8000).optional(),
    status: feedbackStatusSchema.optional(),
    contact: z.union([z.string().max(320), z.null()]).optional(),
    resolution: z.union([z.string().max(8000), z.null()]).optional(),
  })
  .strict();

function isPromptPresetCategory(value: unknown): value is PromptPresetCategory {
  return PROMPT_PRESET_CATEGORIES.includes(value as PromptPresetCategory);
}

function parseBooleanFlag(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return undefined;
}

function parseSortOrder(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.trunc(numeric);
}

function parseTagsPayload(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : String(item ?? '')).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

export function createAdminRouter(): Router {
  const router = Router();

  router.use((req, res, next) => {
    const auth = req as AuthenticatedRequest;
    if (!auth.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
  });

  router.get('/email-config', (_req, res, next) => {
    try {
      const summary = getEmailSettingsSummary();
      res.json({
        gmailUser: summary.gmailUser,
        frontendUrl: summary.frontendUrl,
        gmailConfigured: summary.gmailConfigured,
        googleClientId: process.env.GOOGLE_CLIENT_ID || '',
        googleClientConfigured: Boolean(
          (process.env.GOOGLE_CLIENT_ID || '') && (process.env.GOOGLE_CLIENT_SECRET || ''),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/email-config', (req, res, next) => {
    try {
      const body = req.body as EmailConfigRequest;
      const current = getEmailSettingsSummary();

      const gmailUser = (body.gmailUser ?? current.gmailUser).trim();
      const useMailhog = process.env.USE_MAILHOG === '1';
      if (!gmailUser && !useMailhog) {
        return res.status(400).json({ error: 'Укажите Gmail аккаунт отправителя' });
      }

      const gmailAppPasswordRaw = body.gmailAppPassword?.replace(/\s+/g, '') ?? '';
      const gmailAppPassword = gmailAppPasswordRaw.trim();

      const frontendUrl = body.frontendUrl?.trim();
      const googleClientId = body.googleClientId?.trim();
      const googleClientSecret = body.googleClientSecret?.trim();

      const updates: Record<string, string> = {
        GMAIL_USER: gmailUser,
      };
      if (gmailAppPassword) {
        updates.GMAIL_APP_PASSWORD = gmailAppPassword;
      }
      if (frontendUrl) {
        updates.FRONTEND_URL = frontendUrl;
      }
      if (googleClientId) {
        updates.GOOGLE_CLIENT_ID = googleClientId;
      }
      if (googleClientSecret) {
        updates.GOOGLE_CLIENT_SECRET = googleClientSecret;
      }

      if (Object.keys(updates).length > 0) {
        upsertEnvVariables(updates);
      }

      process.env.GMAIL_USER = gmailUser;
      if (gmailAppPassword) {
        process.env.GMAIL_APP_PASSWORD = gmailAppPassword;
      }
      if (frontendUrl) {
        process.env.FRONTEND_URL = frontendUrl;
      }
      if (googleClientId) {
        process.env.GOOGLE_CLIENT_ID = googleClientId;
      }
      if (googleClientSecret) {
        process.env.GOOGLE_CLIENT_SECRET = googleClientSecret;
      }

      applyEmailSettings({
        gmailUser,
        gmailAppPassword: gmailAppPassword || undefined,
        frontendUrl,
      });

      const summary = getEmailSettingsSummary();
      res.json({
        gmailUser: summary.gmailUser,
        frontendUrl: summary.frontendUrl,
        gmailConfigured: summary.gmailConfigured,
        googleClientId: process.env.GOOGLE_CLIENT_ID || '',
        googleClientConfigured: Boolean(
          (process.env.GOOGLE_CLIENT_ID || '') && (process.env.GOOGLE_CLIENT_SECRET || ''),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/email-config/test', async (_req, res, next) => {
    try {
      const result = await emailService.testEmailConfig();
      if (result.ok) {
        res.json({ status: 'ok' });
        return;
      }
      res.status(400).json({ error: result.error || 'Не удалось подключиться к SMTP' });
    } catch (error) {
      next(error);
    }
  });

  router.get('/ui-settings', (req, res, next) => {
    try {
      const scopeParam = req.query.scope;
      const scope: UiSettingsScope = scopeParam === 'workflow' ? 'workflow' : 'global';
      let projectId: string | undefined;
      if (scope === 'workflow') {
        const projectParam = req.query.project_id;
        if (typeof projectParam !== 'string' || projectParam.trim().length === 0) {
          res.status(400).json({ error: 'project_id is required when scope=workflow' });
          return;
        }
        projectId = projectParam.trim();
      }
      res.json(getUiSettings({ scope, projectId }));
    } catch (error) {
      next(error);
    }
  });

  router.put('/ui-settings', (req, res, next) => {
    try {
      const scopeParam = req.query.scope;
      const scope: UiSettingsScope = scopeParam === 'workflow' ? 'workflow' : 'global';
      let projectId: string | undefined;
      if (scope === 'workflow') {
        const projectParam = req.query.project_id;
        if (typeof projectParam !== 'string' || projectParam.trim().length === 0) {
          res.status(400).json({ error: 'project_id is required when scope=workflow' });
          return;
        }
        projectId = projectParam.trim();
      }
      const payload = uiSettingsSchema.parse(req.body ?? {});
      const nextSettings = updateUiSettings(payload, { scope, projectId });
      res.json(nextSettings);
    } catch (error) {
      next(error);
    }
  });

  router.get('/integrations', (req, res, next) => {
    try {
      const query = req.query as { userId?: string; providerId?: string };
      const userId = typeof query.userId === 'string' && query.userId.trim().length > 0 ? query.userId : undefined;
      const providerFilter = typeof query.providerId === 'string' && query.providerId.trim().length > 0
        ? query.providerId.trim()
        : undefined;

      let integrations = userId ? listIntegrationsForUser(userId) : listAllIntegrations();
      if (providerFilter) {
        integrations = integrations.filter((integration) => integration.providerId === providerFilter);
      }

      const users = listAdminUsers();
      const userMap = new Map(users.map((user) => [user.user_id, user]));

      const payload = integrations.map((integration) => {
        const base = toIntegrationResponse(integration);
        const user = userMap.get(integration.userId);
        return {
          ...base,
          user: user
            ? {
                id: user.user_id,
                email: user.email,
                name: user.name,
                is_admin: user.is_admin,
              }
            : {
                id: integration.userId,
                email: null,
                name: null,
                is_admin: false,
              },
        };
      });

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get('/integrations/:id', (req, res, next) => {
    try {
      const integration = getIntegrationById(req.params.id);
      if (!integration) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }
      const users = listAdminUsers();
      const user = users.find((item) => item.user_id === integration.userId) ?? null;
      res.json({
        ...toIntegrationResponse(integration),
        user: user
          ? {
              id: user.user_id,
              email: user.email,
              name: user.name,
              is_admin: user.is_admin,
            }
          : {
              id: integration.userId,
              email: null,
              name: null,
              is_admin: false,
            },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/integrations', (req, res, next) => {
    try {
      const payload = adminIntegrationCreateSchema.parse(req.body ?? {});
      const users = listAdminUsers();
      const targetUser = users.find((user) => user.user_id === payload.userId);
      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Allow multiple integrations for the same provider
      // Users may have multiple accounts (e.g., two Replicate accounts with different API keys)
      // No duplicate check needed - each integration has unique ID

      const patch = buildIntegrationConfigPatch(payload, payload.providerId);
      const record = createGlobalIntegration({
        id: payload.id,
        userId: payload.userId,
        providerId: payload.providerId,
        name: payload.name,
        config: patch.config,
        enabled: patch.enabled ?? payload.enabled ?? true,
      });

      res.status(201).json(toIntegrationResponse(record));
    } catch (error) {
      log.error({ err: error }, 'Failed to create admin integration');
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ detail: errorMessage }, 'Error message');
      next(error);
    }
  });

  router.put('/integrations/:id', (req, res, next) => {
    try {
      const payload = adminIntegrationUpdateSchema.parse(req.body ?? {});
      const existing = getIntegrationById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }

      if (payload.userId && payload.userId !== existing.userId) {
        res.status(400).json({ error: 'Changing integration owner is not supported' });
        return;
      }

      if (
        payload.providerId && payload.providerId.trim() && payload.providerId.trim() !== existing.providerId
      ) {
        res.status(400).json({ error: 'Changing providerId is not supported' });
        return;
      }

      const patch = buildIntegrationConfigPatch(payload, existing.providerId, existing);
      const hasConfigChanges = Object.keys(patch.config).length > 0;
      const updated = updateGlobalIntegration(existing.id, existing.userId, {
        name: payload.name?.trim(),
        config: hasConfigChanges ? patch.config : undefined,
        enabled: patch.enabled,
      });

      res.json(toIntegrationResponse(updated));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/integrations/:id', (req, res, next) => {
    try {
      const existing = getIntegrationById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }
      const removed = deleteGlobalIntegration(existing.id, existing.userId);
      if (!removed) {
        res.status(404).json({ error: 'Integration not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get('/prompts/export', (_req, res, next) => {
    try {
      const prompts = listPromptPresetsForAdmin();
      const payload = {
        exported_at: new Date().toISOString(),
        count: prompts.length,
        prompts,
      };
      const filename = `prompt-presets-${new Date().toISOString().replace(/[:]/g, '-')}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post('/prompts/import', (req, res, next) => {
    try {
      const body = req.body as PromptPresetImportRequest;
      if (!body?.prompts || !Array.isArray(body.prompts)) {
        res.status(400).json({ error: 'Укажите массив prompts для импорта' });
        return;
      }
      const mode = body.mode === 'replace' ? 'replace' : 'append';
      const imported = importPromptPresets(body.prompts, { replace: mode === 'replace' });
      res.json({
        imported: imported.length,
        mode,
        prompts: imported,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/prompts', (req, res, next) => {
    try {
      const { category: rawCategory, search: rawSearch } = req.query;
      if (rawCategory !== undefined && !isPromptPresetCategory(rawCategory)) {
        res.status(400).json({ error: 'Неизвестная категория промптов' });
        return;
      }
      const category = rawCategory as PromptPresetCategory | undefined;
      const search =
        rawSearch && typeof rawSearch === 'string' && rawSearch.trim().length > 0
          ? rawSearch.trim()
          : undefined;
      const prompts = listPromptPresetsForAdmin({ category, search });
      res.json(prompts);
    } catch (error) {
      next(error);
    }
  });

  router.post('/prompts', (req, res, next) => {
    try {
      const body = req.body as PromptPresetRequestBody;

      if (!isPromptPresetCategory(body.category)) {
        res.status(400).json({ error: 'Укажите корректную категорию промпта' });
        return;
      }

      let quickAccess = false;
      if (body.is_quick_access !== undefined) {
        const parsed = parseBooleanFlag(body.is_quick_access);
        if (parsed === undefined) {
          res.status(400).json({ error: 'Некорректное значение is_quick_access' });
          return;
        }
        quickAccess = parsed;
      }

      let sortOrder: number | undefined;
      if (body.sort_order !== undefined) {
        const parsed = parseSortOrder(body.sort_order);
        if (parsed === undefined) {
          res.status(400).json({ error: 'Некорректное значение sort_order' });
          return;
        }
        sortOrder = parsed;
      }

      const payload: PromptPresetCreateInput = {
        category: body.category,
        label: body.label ?? '',
        content: body.content ?? '',
        description: body.description ?? null,
        tags: parseTagsPayload(body.tags),
        is_quick_access: quickAccess,
        sort_order: sortOrder,
      };

      const created = createPromptPreset(payload);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/prompts/:presetId', (req, res, next) => {
    try {
      const { presetId } = req.params;
      const body = req.body as PromptPresetRequestBody;
      const patch: PromptPresetUpdateInput = {};

      if (Object.prototype.hasOwnProperty.call(body, 'category')) {
        if (!isPromptPresetCategory(body.category)) {
          res.status(400).json({ error: 'Некорректная категория промпта' });
          return;
        }
        patch.category = body.category;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'label')) {
        patch.label = body.label ?? '';
      }

      if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        patch.description = body.description ?? null;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'content')) {
        patch.content = body.content ?? '';
      }

      if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
        patch.tags = parseTagsPayload(body.tags);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'is_quick_access')) {
        const parsed = parseBooleanFlag(body.is_quick_access);
        if (parsed === undefined) {
          res.status(400).json({ error: 'Некорректное значение is_quick_access' });
          return;
        }
        patch.is_quick_access = parsed;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) {
        const parsed = parseSortOrder(body.sort_order);
        if (parsed === undefined) {
          res.status(400).json({ error: 'Некорректное значение sort_order' });
          return;
        }
        patch.sort_order = parsed;
      }

      const updated = updatePromptPreset(presetId, patch);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/prompts/:presetId', (req, res, next) => {
    try {
      const { presetId } = req.params;
      deletePromptPreset(presetId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get('/users', (_req, res, next) => {
    try {
      const users = listAdminUsers();
      res.json(users);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:userId', async (req, res, next) => {
    try {
      const { userId } = req.params;
      const body = req.body as UserUpdateRequest;

      if (body.password !== undefined) {
        if (typeof body.password !== 'string' || body.password.trim().length < 6) {
          res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
          return;
        }
        const hash = await bcrypt.hash(body.password.trim(), 10);
        updateUserPassword(userId, hash);
      }

      const { password: _password, ...rest } = body;
      const updated = updateUserRecord(userId, rest);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/users/:userId', (req, res, next) => {
    try {
      const { userId } = req.params;
      deleteUserCascade(userId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get('/projects', (_req, res, next) => {
    try {
      const projects = listAdminProjects();
      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  router.put('/projects/:projectId/owner', (req, res, next) => {
    try {
      const { projectId } = req.params;
      const { newOwnerId } = req.body as { newOwnerId: string };

      if (!newOwnerId) {
        return res.status(400).json({ error: 'newOwnerId is required' });
      }

      updateProjectOwner(projectId, newOwnerId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get('/feedback', (_req, res, next) => {
    try {
      // ✅ Используем функцию из db.ts
      const entries = listFeedbackEntries();
      
      // Конвертируем в нужный формат для фронтенда
      const formattedEntries = entries.map((entry) => {
        const feedbackTypeMap: Record<string, 'problem' | 'suggestion' | 'unknown'> = {
          'bug': 'problem',
          'feature_request': 'suggestion',
          'performance': 'problem',
          'ui_ux': 'suggestion',
          'other': 'unknown'
        };
        
        return {
          feedback_id: entry.feedback_id,
          type: feedbackTypeMap[entry.type] || 'unknown',
          title: entry.title,
          status: entry.status,
          contact: entry.contact,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
          excerpt: entry.excerpt,
          has_resolution: entry.has_resolution
        };
      });
      
      res.json(formattedEntries);
    } catch (error) {
      next(error);
    }
  });

  router.get('/feedback/:feedbackId', (req, res, next) => {
    try {
      const { feedbackId } = req.params;
      
      // ✅ Используем функцию из db.ts
      const entry = getFeedbackEntry(feedbackId);
      
      if (!entry) {
        res.status(404).json({ error: 'Feedback entry not found' });
        return;
      }
      
      const feedbackTypeMap: Record<string, 'problem' | 'suggestion' | 'unknown'> = {
        'bug': 'problem',
        'feature_request': 'suggestion',
        'performance': 'problem',
        'ui_ux': 'suggestion',
        'other': 'unknown'
      };
      
      const formattedEntry = {
        feedback_id: entry.feedback_id,
        type: feedbackTypeMap[entry.type] || 'unknown',
        title: entry.title,
        status: entry.status,
        contact: entry.contact,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        excerpt: entry.description.substring(0, 280),
        has_resolution: Boolean(entry.resolution),
        description: entry.description,
        resolution: entry.resolution || null
      };
      
      res.json(formattedEntry);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/feedback/:feedbackId', (req, res, next) => {
    try {
      const { feedbackId } = req.params;
      
      // Парсим payload
      const payload = feedbackUpdateSchema.parse(req.body);
      
      // ✅ НОВОЕ: Обновляем в БД
      const updateData: Record<string, any> = {
        ...payload,
        updated_at: new Date().toISOString()
      };
      
      // Строим UPDATE statement
      const setClause = Object.keys(updateData)
        .map(key => `${key} = ?`)
        .join(', ');
      const values = Object.values(updateData);
      values.push(feedbackId);
      
      db.prepare(`
        UPDATE feedback_entries
        SET ${setClause}
        WHERE id = ?
      `).run(...values);
      
      // Возвращаем обновленную запись
      const entry = db.prepare(`
        SELECT 
          id as feedback_id,
          feedback_type,
          message as description,
          SUBSTR(message, 1, 280) as excerpt,
          status,
          user_id,
          created_at,
          updated_at,
          '' as contact,
          CASE WHEN resolution IS NOT NULL AND resolution != '' THEN 1 ELSE 0 END as has_resolution,
          resolution
        FROM feedback_entries
        WHERE id = ?
      `).get(feedbackId) as any;
      
      if (!entry) {
        res.status(404).json({ error: 'Feedback entry not found' });
        return;
      }
      
      const feedbackTypeMap: Record<string, 'problem' | 'suggestion' | 'unknown'> = {
        'bug': 'problem',
        'feature_request': 'suggestion',
        'performance': 'problem',
        'ui_ux': 'suggestion',
        'other': 'unknown'
      };
      
      const formattedEntry = {
        feedback_id: entry.feedback_id,
        type: feedbackTypeMap[entry.feedback_type] || 'unknown',
        title: `[${entry.feedback_type}] ${entry.description.substring(0, 60)}${entry.description.length > 60 ? '...' : ''}`,
        status: entry.status || 'new',
        contact: entry.contact,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        excerpt: entry.excerpt,
        has_resolution: Boolean(entry.has_resolution),
        description: entry.description,
        resolution: entry.resolution || null
      };
      
      res.json(formattedEntry);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/feedback/:feedbackId', (req, res, next) => {
    try {
      const { feedbackId } = req.params;
      
      // ✅ НОВОЕ: Удаляем из БД
      db.prepare('DELETE FROM feedback_entries WHERE id = ?').run(feedbackId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
