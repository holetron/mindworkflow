import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { adminController } from '../controllers/adminController';

export function createAdminRouter(): Router {
  const router = Router();

  // Admin middleware
  router.use((req, res, next) => {
    const auth = req as AuthenticatedRequest;
    if (!auth.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
  });

  // Email config
  router.get('/email-config', adminController.getEmailConfig);
  router.post('/email-config', adminController.postEmailConfig);
  router.post('/email-config/test', adminController.testEmailConfig);

  // UI Settings
  router.get('/ui-settings', adminController.getUiSettings);
  router.put('/ui-settings', adminController.putUiSettings);

  // Integrations
  router.get('/integrations', adminController.listIntegrations);
  router.get('/integrations/:id', adminController.getIntegration);
  router.post('/integrations', adminController.createIntegration);
  router.put('/integrations/:id', adminController.updateIntegration);
  router.delete('/integrations/:id', adminController.deleteIntegration);

  // Prompts
  router.get('/prompts/export', adminController.exportPrompts);
  router.post('/prompts/import', adminController.importPrompts);
  router.get('/prompts', adminController.listPrompts);
  router.post('/prompts', adminController.createPrompt);
  router.patch('/prompts/:presetId', adminController.updatePrompt);
  router.delete('/prompts/:presetId', adminController.deletePrompt);

  // Users
  router.get('/users', adminController.listUsers);
  router.patch('/users/:userId', adminController.updateUser);
  router.delete('/users/:userId', adminController.deleteUser);

  // Projects
  router.get('/projects', adminController.listProjects);
  router.put('/projects/:projectId/owner', adminController.changeProjectOwner);

  // Feedback
  router.get('/feedback', adminController.listFeedback);
  router.get('/feedback/:feedbackId', adminController.getFeedback);
  router.patch('/feedback/:feedbackId', adminController.updateFeedback);
  router.delete('/feedback/:feedbackId', adminController.deleteFeedback);

  return router;
}
