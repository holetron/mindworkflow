import { Router } from 'express';
import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/midjourney' });
import {
  createUserMidjourneyAccount,
  getUserMidjourneyAccounts,
  getUserMidjourneyAccountById,
  updateUserMidjourneyAccount,
  deleteUserMidjourneyAccount,
  type UserMidjourneyAccount,
} from '../services/userMidjourneyAccounts';

const createAccountSchema = z.object({
  name: z.string().min(1),
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  userToken: z.string().min(1),
  userAgent: z.string().optional(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1),
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  userToken: z.string().min(1),
  userAgent: z.string().optional(),
});

function maskToken(secret: string): string {
  if (!secret) {
    return '';
  }
  if (secret.length <= 4) {
    return '*'.repeat(secret.length);
  }
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

function serializeAccount(account: UserMidjourneyAccount) {
  const token = account.user_token ?? '';
  return {
    id: account.id,
    userId: account.user_id,
    name: account.name,
    guildId: account.guild_id,
    channelId: account.channel_id,
    userAgent: account.user_agent ?? '',
    tokenStored: Boolean(token),
    tokenPreview: token ? maskToken(token) : null,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

export function createMidjourneyRouter(db: Database) {
  const router = Router();

  // GET /api/midjourney/accounts - list user's accounts
  router.get('/accounts', (req: AuthenticatedRequest, res) => {
    try {
      const accounts = getUserMidjourneyAccounts(db, req.userId!);
      res.json(accounts.map(serializeAccount));
    } catch (error) {
      log.error({ err: error }, 'Error fetching Midjourney accounts');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/midjourney/accounts - create new account
  router.post('/accounts', (req: AuthenticatedRequest, res) => {
    try {
      const validated = createAccountSchema.parse(req.body);
      const account = createUserMidjourneyAccount(
        db,
        req.userId!,
        validated.name,
        validated.guildId,
        validated.channelId,
        validated.userToken,
        validated.userAgent
      );
      res.status(201).json(serializeAccount(account));
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.issues });
      } else {
        log.error({ err: error }, 'Error creating Midjourney account');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // GET /api/midjourney/accounts/:id - get specific account
  router.get('/accounts/:id', (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }
      
      const account = getUserMidjourneyAccountById(db, req.userId!, id);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }
      
      res.json(serializeAccount(account));
    } catch (error) {
      log.error({ err: error }, 'Error fetching Midjourney account');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/midjourney/accounts/:id - update account
  router.put('/accounts/:id', (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }
      
      const validated = updateAccountSchema.parse(req.body);
      const success = updateUserMidjourneyAccount(
        db,
        req.userId!,
        id,
        validated.name,
        validated.guildId,
        validated.channelId,
        validated.userToken,
        validated.userAgent
      );
      
      if (!success) {
        return res.status(404).json({ error: 'Account not found' });
      }
      
      const updated = getUserMidjourneyAccountById(db, req.userId!, id);
      res.json(updated ? serializeAccount(updated) : null);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.issues });
      } else {
        log.error({ err: error }, 'Error updating Midjourney account');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // DELETE /api/midjourney/accounts/:id - delete account
  router.delete('/accounts/:id', (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }
      
      const success = deleteUserMidjourneyAccount(db, req.userId!, id);
      if (!success) {
        return res.status(404).json({ error: 'Account not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      log.error({ err: error }, 'Error deleting Midjourney account');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
