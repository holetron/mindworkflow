import { Router } from 'express';
import { z } from 'zod';
import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { createFeedbackEntry } from '../db';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/feedback' });
const feedbackSchema = z.object({
  type: z.enum(['problem', 'suggestion']),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  contact: z.string().optional().nullable(),
});

type FeedbackPayload = z.infer<typeof feedbackSchema>;

export function createFeedbackRouter(): Router {
  const router = Router();

  // POST /feedback - Submit feedback
  router.post('/', (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const payload = feedbackSchema.parse(req.body);

      const entry = createFeedbackEntry({
        feedback_id: uuidv4(),
        type: payload.type,
        title: payload.title,
        description: payload.description,
        status: 'new',
        contact: payload.contact || null,
        resolution: null,
        source: 'user_submission',
        created_at: new Date().toISOString(),
      });

      log.info('✅ Feedback created %s', entry.feedback_id);
      res.status(201).json({ feedback_id: entry.feedback_id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid feedback data', details: error.issues });
        return;
      }
      log.error({ err: error }, '❌ Failed to submit feedback');
      res
        .status((error as { status?: number }).status ?? 500)
        .json({ error: 'Failed to submit feedback' });
    }
  });

  return router;
}
