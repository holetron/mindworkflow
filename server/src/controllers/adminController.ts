import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import {
  PromptPresetCreateInput,
  PromptPresetImportInput,
  PromptPresetUpdateInput,
  createPromptPreset, deletePromptPreset, deleteUserCascade,
  listAdminProjects, listAdminUsers, listPromptPresetsForAdmin,
  listFeedbackEntries, getFeedbackEntry,
  updateProjectOwner, updatePromptPreset, importPromptPresets,
  updateUserRecord, updateUserPassword, db,
} from '../db';
import type { PromptPresetCategory } from '../db';
import { applyEmailSettings, getEmailSettingsSummary, emailService } from '../services/email';
import { upsertEnvVariables } from '../utils/envWriter';
import {
  listAllIntegrations, listIntegrationsForUser, getIntegrationById,
  createIntegration as createGlobalIntegration,
  updateIntegration as updateGlobalIntegration,
  deleteIntegration as deleteGlobalIntegration,
} from '../services/integrationRepository';
import { buildIntegrationConfigPatch, toIntegrationResponse } from '../services/integrationUtils';
import { UiSettingsScope, getUiSettings, updateUiSettings } from '../services/uiSettings';
import { uiSettingsSchema } from '../validation/uiSettings';
import {
  adminIntegrationCreateSchema, adminIntegrationUpdateSchema,
  feedbackUpdateSchema, feedbackTypeMap,
  isPromptPresetCategory, parseBooleanFlag, parseSortOrder, parseTagsPayload,
} from './adminHelpers';

import { logger } from '../lib/logger';
const log = logger.child({ module: 'controllers/admin' });

interface UserUpdateRequest { email?: string; name?: string; is_admin?: boolean; password?: string; }
interface EmailConfigRequest { gmailUser?: string; gmailAppPassword?: string; frontendUrl?: string; googleClientId?: string; googleClientSecret?: string; }
interface PromptPresetRequestBody { category?: string; label?: string; description?: string | null; content?: string; tags?: unknown; is_quick_access?: unknown; sort_order?: unknown; }
interface PromptPresetImportRequest { prompts?: PromptPresetImportInput[]; mode?: 'append' | 'replace'; }

export const adminController = {
  getEmailConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      const s = getEmailSettingsSummary();
      res.json({ gmailUser: s.gmailUser, frontendUrl: s.frontendUrl, gmailConfigured: s.gmailConfigured, googleClientId: process.env.GOOGLE_CLIENT_ID || '', googleClientConfigured: Boolean((process.env.GOOGLE_CLIENT_ID || '') && (process.env.GOOGLE_CLIENT_SECRET || '')) });
    } catch (error) { next(error); }
  },

  postEmailConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as EmailConfigRequest;
      const current = getEmailSettingsSummary();
      const gmailUser = (body.gmailUser ?? current.gmailUser).trim();
      if (!gmailUser && process.env.USE_MAILHOG !== '1') return res.status(400).json({ error: 'Please specify the sender Gmail account' });
      const gmailAppPassword = (body.gmailAppPassword?.replace(/\s+/g, '') ?? '').trim();
      const frontendUrl = body.frontendUrl?.trim();
      const googleClientId = body.googleClientId?.trim();
      const googleClientSecret = body.googleClientSecret?.trim();
      const updates: Record<string, string> = { GMAIL_USER: gmailUser };
      if (gmailAppPassword) updates.GMAIL_APP_PASSWORD = gmailAppPassword;
      if (frontendUrl) updates.FRONTEND_URL = frontendUrl;
      if (googleClientId) updates.GOOGLE_CLIENT_ID = googleClientId;
      if (googleClientSecret) updates.GOOGLE_CLIENT_SECRET = googleClientSecret;
      if (Object.keys(updates).length > 0) upsertEnvVariables(updates);
      process.env.GMAIL_USER = gmailUser;
      if (gmailAppPassword) process.env.GMAIL_APP_PASSWORD = gmailAppPassword;
      if (frontendUrl) process.env.FRONTEND_URL = frontendUrl;
      if (googleClientId) process.env.GOOGLE_CLIENT_ID = googleClientId;
      if (googleClientSecret) process.env.GOOGLE_CLIENT_SECRET = googleClientSecret;
      applyEmailSettings({ gmailUser, gmailAppPassword: gmailAppPassword || undefined, frontendUrl });
      const s = getEmailSettingsSummary();
      res.json({ gmailUser: s.gmailUser, frontendUrl: s.frontendUrl, gmailConfigured: s.gmailConfigured, googleClientId: process.env.GOOGLE_CLIENT_ID || '', googleClientConfigured: Boolean((process.env.GOOGLE_CLIENT_ID || '') && (process.env.GOOGLE_CLIENT_SECRET || '')) });
    } catch (error) { next(error); }
  },

  async testEmailConfig(_req: Request, res: Response, next: NextFunction) {
    try { const r = await emailService.testEmailConfig(); if (r.ok) { res.json({ status: 'ok' }); return; } res.status(400).json({ error: r.error || 'Failed' }); }
    catch (error) { next(error); }
  },

  getUiSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const scope: UiSettingsScope = req.query.scope === 'workflow' ? 'workflow' : 'global';
      let projectId: string | undefined;
      if (scope === 'workflow') { const p = req.query.project_id; if (typeof p !== 'string' || !p.trim()) { res.status(400).json({ error: 'project_id required' }); return; } projectId = p.trim(); }
      res.json(getUiSettings({ scope, projectId }));
    } catch (error) { next(error); }
  },

  putUiSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const scope: UiSettingsScope = req.query.scope === 'workflow' ? 'workflow' : 'global';
      let projectId: string | undefined;
      if (scope === 'workflow') { const p = req.query.project_id; if (typeof p !== 'string' || !p.trim()) { res.status(400).json({ error: 'project_id required' }); return; } projectId = p.trim(); }
      res.json(updateUiSettings(uiSettingsSchema.parse(req.body ?? {}), { scope, projectId }));
    } catch (error) { next(error); }
  },

  listIntegrations(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as { userId?: string; providerId?: string };
      const userId = typeof q.userId === 'string' && q.userId.trim().length > 0 ? q.userId : undefined;
      const pf = typeof q.providerId === 'string' && q.providerId.trim().length > 0 ? q.providerId.trim() : undefined;
      let integrations = userId ? listIntegrationsForUser(userId) : listAllIntegrations();
      if (pf) integrations = integrations.filter(i => i.providerId === pf);
      const users = listAdminUsers();
      const userMap = new Map(users.map(u => [u.user_id, u]));
      res.json(integrations.map(i => {
        const u = userMap.get(i.userId);
        return { ...toIntegrationResponse(i), user: u ? { id: u.user_id, email: u.email, name: u.name, is_admin: u.is_admin } : { id: i.userId, email: null, name: null, is_admin: false } };
      }));
    } catch (error) { next(error); }
  },

  getIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const i = getIntegrationById(req.params.id);
      if (!i) { res.status(404).json({ error: 'Integration not found' }); return; }
      const users = listAdminUsers();
      const u = users.find(x => x.user_id === i.userId) ?? null;
      res.json({ ...toIntegrationResponse(i), user: u ? { id: u.user_id, email: u.email, name: u.name, is_admin: u.is_admin } : { id: i.userId, email: null, name: null, is_admin: false } });
    } catch (error) { next(error); }
  },

  createIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = adminIntegrationCreateSchema.parse(req.body ?? {});
      const users = listAdminUsers();
      if (!users.find(u => u.user_id === payload.userId)) { res.status(404).json({ error: 'User not found' }); return; }
      const patch = buildIntegrationConfigPatch(payload, payload.providerId);
      res.status(201).json(toIntegrationResponse(createGlobalIntegration({ id: payload.id, userId: payload.userId, providerId: payload.providerId, name: payload.name, config: patch.config, enabled: patch.enabled ?? payload.enabled ?? true })));
    } catch (error) { log.error({ err: error }, 'Failed to create admin integration'); next(error); }
  },

  updateIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = adminIntegrationUpdateSchema.parse(req.body ?? {});
      const existing = getIntegrationById(req.params.id);
      if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }
      if (payload.userId && payload.userId !== existing.userId) { res.status(400).json({ error: 'Changing owner not supported' }); return; }
      if (payload.providerId && payload.providerId.trim() && payload.providerId.trim() !== existing.providerId) { res.status(400).json({ error: 'Changing providerId not supported' }); return; }
      const patch = buildIntegrationConfigPatch(payload, existing.providerId, existing);
      res.json(toIntegrationResponse(updateGlobalIntegration(existing.id, existing.userId, { name: payload.name?.trim(), config: Object.keys(patch.config).length > 0 ? patch.config : undefined, enabled: patch.enabled })));
    } catch (error) { next(error); }
  },

  deleteIntegration(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = getIntegrationById(req.params.id);
      if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }
      if (!deleteGlobalIntegration(existing.id, existing.userId)) { res.status(404).json({ error: 'Integration not found' }); return; }
      res.status(204).send();
    } catch (error) { next(error); }
  },

  exportPrompts(_req: Request, res: Response, next: NextFunction) {
    try {
      const prompts = listPromptPresetsForAdmin();
      res.setHeader('Content-Disposition', `attachment; filename="prompt-presets-${new Date().toISOString().replace(/[:]/g, '-')}.json"`);
      res.json({ exported_at: new Date().toISOString(), count: prompts.length, prompts });
    } catch (error) { next(error); }
  },

  importPrompts(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as PromptPresetImportRequest;
      if (!body?.prompts || !Array.isArray(body.prompts)) { res.status(400).json({ error: 'Please provide a prompts array' }); return; }
      const mode = body.mode === 'replace' ? 'replace' : 'append';
      const imported = importPromptPresets(body.prompts, { replace: mode === 'replace' });
      res.json({ imported: imported.length, mode, prompts: imported });
    } catch (error) { next(error); }
  },

  listPrompts(req: Request, res: Response, next: NextFunction) {
    try {
      const { category: rc, search: rs } = req.query;
      if (rc !== undefined && !isPromptPresetCategory(rc)) { res.status(400).json({ error: 'Unknown prompt category' }); return; }
      res.json(listPromptPresetsForAdmin({ category: rc as PromptPresetCategory | undefined, search: rs && typeof rs === 'string' && rs.trim().length > 0 ? rs.trim() : undefined }));
    } catch (error) { next(error); }
  },

  createPrompt(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as PromptPresetRequestBody;
      if (!isPromptPresetCategory(body.category)) { res.status(400).json({ error: 'Please specify a valid prompt category' }); return; }
      let quickAccess = false;
      if (body.is_quick_access !== undefined) { const p = parseBooleanFlag(body.is_quick_access); if (p === undefined) { res.status(400).json({ error: 'Invalid is_quick_access' }); return; } quickAccess = p; }
      let sortOrder: number | undefined;
      if (body.sort_order !== undefined) { const p = parseSortOrder(body.sort_order); if (p === undefined) { res.status(400).json({ error: 'Invalid sort_order' }); return; } sortOrder = p; }
      res.status(201).json(createPromptPreset({ category: body.category, label: body.label ?? '', content: body.content ?? '', description: body.description ?? null, tags: parseTagsPayload(body.tags), is_quick_access: quickAccess, sort_order: sortOrder }));
    } catch (error) { next(error); }
  },

  updatePrompt(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as PromptPresetRequestBody;
      const patch: PromptPresetUpdateInput = {};
      if (Object.prototype.hasOwnProperty.call(body, 'category')) { if (!isPromptPresetCategory(body.category)) { res.status(400).json({ error: 'Invalid category' }); return; } patch.category = body.category; }
      if (Object.prototype.hasOwnProperty.call(body, 'label')) patch.label = body.label ?? '';
      if (Object.prototype.hasOwnProperty.call(body, 'description')) patch.description = body.description ?? null;
      if (Object.prototype.hasOwnProperty.call(body, 'content')) patch.content = body.content ?? '';
      if (Object.prototype.hasOwnProperty.call(body, 'tags')) patch.tags = parseTagsPayload(body.tags);
      if (Object.prototype.hasOwnProperty.call(body, 'is_quick_access')) { const p = parseBooleanFlag(body.is_quick_access); if (p === undefined) { res.status(400).json({ error: 'Invalid is_quick_access' }); return; } patch.is_quick_access = p; }
      if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) { const p = parseSortOrder(body.sort_order); if (p === undefined) { res.status(400).json({ error: 'Invalid sort_order' }); return; } patch.sort_order = p; }
      res.json(updatePromptPreset(req.params.presetId, patch));
    } catch (error) { next(error); }
  },

  deletePrompt(req: Request, res: Response, next: NextFunction) { try { deletePromptPreset(req.params.presetId); res.status(204).send(); } catch (e) { next(e); } },
  listUsers(_req: Request, res: Response, next: NextFunction) { try { res.json(listAdminUsers()); } catch (e) { next(e); } },

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params; const body = req.body as UserUpdateRequest;
      if (body.password !== undefined) { if (typeof body.password !== 'string' || body.password.trim().length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; } updateUserPassword(userId, await bcrypt.hash(body.password.trim(), 10)); }
      const { password: _, ...rest } = body;
      res.json(updateUserRecord(userId, rest));
    } catch (error) { next(error); }
  },

  deleteUser(req: Request, res: Response, next: NextFunction) { try { deleteUserCascade(req.params.userId); res.status(204).send(); } catch (e) { next(e); } },
  listProjects(_req: Request, res: Response, next: NextFunction) { try { res.json(listAdminProjects()); } catch (e) { next(e); } },

  changeProjectOwner(req: Request, res: Response, next: NextFunction) {
    try { const { newOwnerId } = req.body; if (!newOwnerId) return res.status(400).json({ error: 'newOwnerId is required' }); updateProjectOwner(req.params.projectId, newOwnerId); res.status(204).send(); }
    catch (error) { next(error); }
  },

  listFeedback(_req: Request, res: Response, next: NextFunction) {
    try { res.json(listFeedbackEntries().map(e => ({ feedback_id: e.feedback_id, type: feedbackTypeMap[e.type] || 'unknown', title: e.title, status: e.status, contact: e.contact, created_at: e.created_at, updated_at: e.updated_at, excerpt: e.excerpt, has_resolution: e.has_resolution }))); }
    catch (error) { next(error); }
  },

  getFeedback(req: Request, res: Response, next: NextFunction) {
    try {
      const entry = getFeedbackEntry(req.params.feedbackId);
      if (!entry) { res.status(404).json({ error: 'Feedback entry not found' }); return; }
      res.json({ feedback_id: entry.feedback_id, type: feedbackTypeMap[entry.type] || 'unknown', title: entry.title, status: entry.status, contact: entry.contact, created_at: entry.created_at, updated_at: entry.updated_at, excerpt: entry.description.substring(0, 280), has_resolution: Boolean(entry.resolution), description: entry.description, resolution: entry.resolution || null });
    } catch (error) { next(error); }
  },

  updateFeedback(req: Request, res: Response, next: NextFunction) {
    try {
      const { feedbackId } = req.params;
      const payload = feedbackUpdateSchema.parse(req.body);
      const updateData: Record<string, any> = { ...payload, updated_at: new Date().toISOString() };
      const setClause = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updateData); values.push(feedbackId);
      db.prepare(`UPDATE feedback_entries SET ${setClause} WHERE id = ?`).run(...values);
      const entry = db.prepare(`SELECT id as feedback_id, feedback_type, message as description, SUBSTR(message, 1, 280) as excerpt, status, user_id, created_at, updated_at, '' as contact, CASE WHEN resolution IS NOT NULL AND resolution != '' THEN 1 ELSE 0 END as has_resolution, resolution FROM feedback_entries WHERE id = ?`).get(feedbackId) as any;
      if (!entry) { res.status(404).json({ error: 'Feedback entry not found' }); return; }
      res.json({ feedback_id: entry.feedback_id, type: feedbackTypeMap[entry.feedback_type] || 'unknown', title: `[${entry.feedback_type}] ${entry.description.substring(0, 60)}${entry.description.length > 60 ? '...' : ''}`, status: entry.status || 'new', contact: entry.contact, created_at: entry.created_at, updated_at: entry.updated_at, excerpt: entry.excerpt, has_resolution: Boolean(entry.has_resolution), description: entry.description, resolution: entry.resolution || null });
    } catch (error) { next(error); }
  },

  deleteFeedback(req: Request, res: Response, next: NextFunction) {
    try { db.prepare('DELETE FROM feedback_entries WHERE id = ?').run(req.params.feedbackId); res.status(204).send(); }
    catch (error) { next(error); }
  },
};
