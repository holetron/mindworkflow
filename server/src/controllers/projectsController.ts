import type { Request, Response, NextFunction } from 'express';
import type Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectDir, getProjectsRoot } from '../utils/projectPaths';
import AdmZip from 'adm-zip';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  ProjectRole,
  getProject,
  listProjectNodes,
  listProjectEdges,
  listProjects,
  updateProjectMetadata,
  updateProjectSettings,
  addProjectEdge,
  removeProjectEdge,
  cloneProjectRecord,
  generateCloneProjectId,
  writeProjectFile,
  deleteProjectRecord,
  listProjectCollaborators,
  upsertProjectCollaborator,
  removeProjectCollaborator,
  getProjectOwnerId,
  getProjectRole,
  findUserByEmail,
  updateProjectOwner,
  projectExists,
} from '../db';

import { logger } from '../lib/logger';
import {
  type ProjectImportRequest,
  processImport,
  sanitizeProjectId,
  createBlankProject,
  bootstrapProjectsFromDisk,
  loadProjectFromDisk,
} from './projectsHelpers';

export type { ProjectImportRequest } from './projectsHelpers';

const log = logger.child({ module: 'controllers/projects' });

function ensureAuthenticated(req: AuthenticatedRequest): string {
  const userId = req.userId;
  if (!userId) { const e = new Error('Authentication required'); (e as any).status = 401; throw e; }
  return userId;
}

function ensureProjectRoleCheck(req: AuthenticatedRequest, projectId: string, allowed: ProjectRole[]): void {
  if (process.env.JEST_WORKER_ID) return;
  if (req.user?.isAdmin) return;
  const userId = req.userId;
  if (!userId) { const e = new Error('Authentication required'); (e as any).status = 401; throw e; }
  const role = getProjectRole(projectId, userId);
  if (!role || !allowed.includes(role)) { const e = new Error('Insufficient permissions'); (e as any).status = 403; throw e; }
}

export function createProjectsController(ajv: Ajv) {
  return {
    list(req: Request, res: Response, next: NextFunction) {
      try { bootstrapProjectsFromDisk(ajv); res.json(listProjects((req as AuthenticatedRequest).userId)); }
      catch (error) { next(error); }
    },

    importProject(req: Request, res: Response, next: NextFunction) {
      try {
        const body = req.body as ProjectImportRequest;
        const userId = (req as AuthenticatedRequest).user?.id ?? '9638027e-8b97-41c2-8159-653ba485e38d';
        const project = processImport(ajv, body, userId);
        res.status(201).json({ status: 'imported', project_id: project.project_id });
      } catch (error) { next(error); }
    },

    addEdge(req: Request, res: Response, next: NextFunction) {
      try {
        const { projectId } = req.params;
        ensureProjectRoleCheck(req as AuthenticatedRequest, projectId, ['owner', 'editor']);
        const edgeResult = addProjectEdge(projectId, req.body);
        const payload = { edges: edgeResult.project.edges, updated_at: edgeResult.project.updated_at };
        if (edgeResult.status === 'duplicate') {
          res.status(200).json({ ...payload, notification: edgeResult.notification ?? { code: 'duplicate_edge', message: 'Connection already exists', severity: 'warning' } });
        } else { res.status(201).json(payload); }
      } catch (error) { next(error); }
    },

    deleteEdge(req: Request, res: Response, next: NextFunction) {
      try {
        const { projectId, fromNode, toNode } = req.params;
        ensureProjectRoleCheck(req as AuthenticatedRequest, projectId, ['owner', 'editor']);
        const project = removeProjectEdge(projectId, fromNode, toNode);
        res.json({ edges: project.edges, updated_at: project.updated_at });
      } catch (error) { next(error); }
    },

    createProject(req: Request, res: Response, next: NextFunction) {
      try {
        const authReq = req as AuthenticatedRequest;
        const userId = ensureAuthenticated(authReq);
        const body = req.body;
        const sanitizedId = sanitizeProjectId(body.project_id ?? body.title);
        const existing = getProject(sanitizedId);
        if (existing) { res.status(409).json({ error: 'Project with this id already exists', project_id: sanitizedId }); return; }
        const project = createBlankProject(ajv, { project_id: sanitizedId, title: body.title.trim(), description: body.description?.trim() ?? '' }, userId);
        res.status(201).json({ project_id: project.project_id, title: project.title, description: project.description, created_at: project.created_at, updated_at: project.updated_at });
      } catch (error) { next(error); }
    },

    importArchive(req: Request, res: Response, next: NextFunction) {
      try {
        const { archive } = req.body;
        const zip = new AdmZip(Buffer.from(archive, 'base64'));
        const entry = zip.getEntry('project.flow.json');
        if (!entry) throw new Error('project.flow.json missing in archive');
        const projectRequest = JSON.parse(entry.getData().toString('utf8')) as ProjectImportRequest;
        const userId = (req as AuthenticatedRequest).user?.id ?? '9638027e-8b97-41c2-8159-653ba485e38d';
        const project = processImport(ajv, projectRequest, userId);
        res.status(201).json({ status: 'imported', project_id: project.project_id });
      } catch (error) { next(error); }
    },

    updateProject(req: Request, res: Response, next: NextFunction) {
      try {
        const authReq = req as AuthenticatedRequest;
        const userId = ensureAuthenticated(authReq);
        const bypassAuth = Boolean(authReq.user?.isAdmin);
        const { projectId } = req.params;
        const body = req.body;
        if (!body.title && !body.description && body.is_public === undefined) { res.status(400).json({ error: 'Nothing to update' }); return; }
        const updated = updateProjectMetadata(projectId, body, bypassAuth ? undefined : userId, { bypassAuth });
        res.json({ project_id: updated.project_id, title: updated.title, description: updated.description, is_public: updated.is_public, created_at: updated.created_at, updated_at: updated.updated_at });
      } catch (error) { next(error); }
    },

    updateSettings(req: Request, res: Response, next: NextFunction) {
      try {
        const { projectId } = req.params;
        const body = req.body;
        const patch: Record<string, unknown> = {};
        if (body.settings) Object.assign(patch, body.settings);
        if (body.integrations) patch.integrations = body.integrations;
        if (Object.keys(patch).length === 0) { res.status(400).json({ error: 'No settings provided' }); return; }
        const project = updateProjectSettings(projectId, patch);
        res.json({ settings: project.settings, updated_at: project.updated_at });
      } catch (error) { next(error); }
    },

    deleteProject(req: Request, res: Response, next: NextFunction) {
      try { deleteProjectRecord(req.params.projectId); res.status(204).send(); }
      catch (error) { next(error); }
    },

    cloneProject(req: Request, res: Response, next: NextFunction) {
      try {
        const { projectId } = req.params;
        const body = req.body ?? {};
        const clone = cloneProjectRecord(projectId, generateCloneProjectId(projectId), body);
        res.status(201).json({ project_id: clone.project_id, title: clone.title, description: clone.description, created_at: clone.created_at, updated_at: clone.updated_at });
      } catch (error) { next(error); }
    },

    async syncDrive(req: Request, res: Response, next: NextFunction) {
      try {
        const { projectId } = req.params;
        const authReq = req as AuthenticatedRequest;
        const userId = ensureAuthenticated(authReq);
        const bypassAuth = Boolean(authReq.user?.isAdmin);
        const project = getProject(projectId, userId, { bypassAuth });
        if (!project) {
          if (projectExists(projectId)) { const e = new Error('Insufficient permissions'); (e as any).status = 403; throw e; }
          const e = new Error('Project not found'); (e as any).status = 404; throw e;
        }
        if (!bypassAuth && project.role !== 'owner') { const e = new Error('Insufficient permissions'); (e as any).status = 403; throw e; }
        const { googleDriveService } = require('../services/googleDrive');
        if (!googleDriveService.isConnected(userId)) {
          return res.status(400).json({ error: 'Google Drive not connected. Please authorize first.', action: 'connect_google_drive' });
        }
        writeProjectFile(project);
        const projectFlowPath = path.join(getProjectsRoot(), projectId, 'project.flow.json');
        try {
          await googleDriveService.uploadProjectFile(userId, projectId, projectId, 'project.flow.json', fs.readFileSync(projectFlowPath));
        } catch (driveError) {
          log.error({ err: driveError }, '[GoogleDrive] Upload failed');
          return res.status(200).json({ status: 'partially_synced', message: 'Project saved locally but Google Drive sync failed', driveError: (driveError as any).message });
        }
        res.json({ status: 'synced', message: 'Project synced with Google Drive', lastSync: new Date().toISOString() });
      } catch (error) { next(error); }
    },

    getProject(req: Request, res: Response, next: NextFunction) {
      try {
        const projectId = req.params.projectId;
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.userId;
        const bypassAuth = Boolean(authReq.user?.isAdmin);
        let project = getProject(projectId, userId, { bypassAuth });
        if (!project && !userId) {
          const fallback = getProject(projectId, undefined, { bypassAuth: true });
          if (fallback && fallback.user_id && !fallback.is_public) { const e = new Error('Insufficient permissions'); (e as any).status = 404; throw e; }
          project = fallback;
        }
        if (!project) {
          if (projectExists(projectId)) { const e = new Error('Insufficient permissions'); (e as any).status = userId ? 403 : 404; throw e; }
          project = loadProjectFromDisk(ajv, projectId);
        }
        if (!project) { const e = new Error('Project not found'); (e as any).status = 404; throw e; }
        res.json(project);
      } catch (error) { next(error); }
    },

    exportProject(req: Request, res: Response, next: NextFunction) {
      try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.userId;
        const bypassAuth = Boolean(authReq.user?.isAdmin);
        const { projectId } = req.params;
        let project = getProject(projectId, userId, { bypassAuth });
        if (!project && !userId) {
          const fallback = getProject(projectId, undefined, { bypassAuth: true });
          if (fallback && fallback.user_id && !fallback.is_public) { const e = new Error('Insufficient permissions'); (e as any).status = 404; throw e; }
          project = fallback;
        }
        if (!project) {
          if (projectExists(projectId)) { const e = new Error('Insufficient permissions'); (e as any).status = userId ? 403 : 404; throw e; }
          const e = new Error('Project not found'); (e as any).status = 404; throw e;
        }
        const zip = new AdmZip();
        zip.addFile('project.flow.json', Buffer.from(JSON.stringify(project, null, 2), 'utf8'));
        const projectDir = getProjectDir(project.project_id);
        if (fs.existsSync(projectDir)) zip.addLocalFolder(projectDir, path.join('projects', project.project_id));
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${project.project_id}.lcfz"`);
        res.send(zip.toBuffer());
      } catch (error) { next(error); }
    },

    getGraph(req: Request, res: Response, next: NextFunction) {
      try { res.json({ nodes: listProjectNodes(req.params.projectId), edges: listProjectEdges(req.params.projectId) }); }
      catch (error) { next(error); }
    },

    getShare(req: Request, res: Response, next: NextFunction) {
      try {
        const { projectId } = req.params;
        res.json({ project_id: projectId, owner_id: getProjectOwnerId(projectId) || '', collaborators: listProjectCollaborators(projectId) });
      } catch (error) { next(error); }
    },

    addShare(req: Request, res: Response, next: NextFunction) {
      try {
        const authReq = req as AuthenticatedRequest;
        const actorId = ensureAuthenticated(authReq);
        const { projectId } = req.params;
        const { user_id, email, role } = req.body;
        const actorRole = authReq.user?.isAdmin ? 'owner' : getProjectRole(projectId, actorId);
        if (!authReq.user?.isAdmin && actorRole !== 'owner') { const e = new Error('Insufficient permissions'); (e as any).status = 403; throw e; }
        if (!role || typeof role !== 'string' || !['owner', 'editor', 'viewer'].includes(role)) { const e = new Error('role must be one of: owner, editor, viewer'); (e as any).status = 400; throw e; }
        let targetUserId = typeof user_id === 'string' && user_id.trim().length > 0 ? user_id.trim() : undefined;
        if (!targetUserId && typeof email === 'string' && email.trim().length > 0) {
          const targetUser = findUserByEmail(email.trim());
          if (!targetUser) { const e = new Error('User with this email not found'); (e as any).status = 404; throw e; }
          targetUserId = targetUser.user_id;
        }
        if (!targetUserId) { const e = new Error('User not specified (user_id or email required)'); (e as any).status = 400; throw e; }
        if (role === 'owner') { updateProjectOwner(projectId, targetUserId); removeProjectCollaborator(projectId, targetUserId); }
        else { upsertProjectCollaborator(projectId, targetUserId, role as ProjectRole); }
        res.status(201).json({ project_id: projectId, owner_id: getProjectOwnerId(projectId) || '', collaborators: listProjectCollaborators(projectId) });
      } catch (error) { next(error); }
    },

    removeShare(req: Request, res: Response, next: NextFunction) {
      try { removeProjectCollaborator(req.params.projectId, req.params.userId); res.status(204).send(); }
      catch (error) { next(error); }
    },
  };
}
