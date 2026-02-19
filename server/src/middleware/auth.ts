import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { config } from '../lib/config';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'auth' });
export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: { id: string; email: string; name: string; isAdmin: boolean };
}

interface JwtPayload {
  userId: string;
  email: string;
  isAdmin?: boolean;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  log.info({ path: req.path, authHeader: authHeader ? 'present' : 'missing' }, 'authMiddleware request');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Token is optional for read-only endpoints; continue without attaching user context.
    log.info('authMiddleware - no token, continuing without user context');
    return next();
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    log.info({ userId: decoded.userId }, 'authMiddleware decoded token');

    // Always check current admin status from database for security
    const row = db
      .prepare('SELECT email, name, is_admin FROM users WHERE user_id = ?')
      .get(decoded.userId) as { email?: string; name?: string; is_admin?: number } | undefined;

    if (!row) {
      log.info('authMiddleware - user not found in database');
      return res.status(401).json({ error: 'User not found' });
    }

    const isAdmin = row.is_admin === 1;

    (req as AuthenticatedRequest).userId = decoded.userId;
    (req as AuthenticatedRequest).user = {
      id: decoded.userId,
      email: row.email || decoded.email,
      name: row.name || '',
      isAdmin,
    };
    log.info({ userId: (req as AuthenticatedRequest).userId, isAdmin }, 'authMiddleware set user context');
    return next();
  } catch (error) {
    log.info({ err: error }, 'authMiddleware - token verification failed');
    return res.status(401).json({ error: 'Invalid token' });
  }
}
