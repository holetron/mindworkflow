import { Router } from 'express';
import { getProjectRole } from '../db';
import { AuthenticatedRequest } from '../middleware/auth';
import { getUiSettings, updateUiSettings, type UiSettingsScope } from '../services/uiSettings';
import { uiSettingsSchema } from '../validation/uiSettings';

export function createSettingsRouter(): Router {
  const router = Router();

  router.get('/ui', (req, res, next) => {
    try {
      const scopeParam = req.query.scope;
      const scope: UiSettingsScope = scopeParam === 'workflow' ? 'workflow' : 'global';
      let projectId: string | undefined;
      const authReq = req as AuthenticatedRequest;
      if (scope === 'workflow') {
        const projectParam = req.query.project_id;
        if (typeof projectParam !== 'string' || projectParam.trim().length === 0) {
          res.status(400).json({ error: 'project_id is required when scope=workflow' });
          return;
        }
        projectId = projectParam.trim();

        const actorId = authReq.userId;
        if (!actorId) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        if (!authReq.user?.isAdmin) {
          const role = getProjectRole(projectId, actorId);
          if (!role) {
            res.status(403).json({ error: 'Project access required' });
            return;
          }
        }
      }
      const settings = getUiSettings({ scope, projectId });
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  router.put('/ui', (req, res, next) => {
    try {
      const scopeParam = req.query.scope;
      const scope: UiSettingsScope = scopeParam === 'workflow' ? 'workflow' : 'global';
      let projectId: string | undefined;
      const authReq = req as AuthenticatedRequest;

      if (scope === 'workflow') {
        const projectParam = req.query.project_id;
        if (typeof projectParam !== 'string' || projectParam.trim().length === 0) {
          res.status(400).json({ error: 'project_id is required when scope=workflow' });
          return;
        }
        projectId = projectParam.trim();

        const actorId = authReq.userId;
        if (!actorId) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        if (!authReq.user?.isAdmin) {
          const role = getProjectRole(projectId, actorId);
          if (!role || (role !== 'owner' && role !== 'editor')) {
            res.status(403).json({ error: 'Editor access required for workflow settings' });
            return;
          }
        }
      } else if (!authReq.user?.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      const payload = uiSettingsSchema.parse(req.body ?? {});
      const updated = updateUiSettings(payload, { scope, projectId });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
