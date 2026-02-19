import { Router } from 'express';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import {
  db,
  issuePasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  updateUserPassword,
} from '../db';
import { emailService } from '../services/email';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'routes/auth' });
const getGoogleClientId = (): string => (process.env.GOOGLE_CLIENT_ID || '').trim();
const getGoogleClient = (): OAuth2Client | null => {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return null;
  }
  return new OAuth2Client(clientId);
};

// In-memory storage для OAuth state (валиден 10 минут)
const oauthStates = new Map<string, { userId: string; expiresAt: number }>();

// Очищаем истекшие states каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (data.expiresAt < now) {
      oauthStates.delete(state);
    }
  }
}, 300000);

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface AuthTokenPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
}

export function createAuthRouter() {
  const router = Router();

  router.get('/google/config', (_req, res) => {
    const clientId = getGoogleClientId();
    res.json({ clientId: clientId || null });
  });

  router.post('/register', async (req, res) => {
    const { email, password, name }: RegisterRequest = req.body;

    if (!email || !password || !name || password.length < 6) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    try {
      const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email);
      if (existing) {
        return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO users (user_id, email, password_hash, name, created_at, updated_at, is_admin)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      ).run(userId, email, passwordHash, name, now, now);

      const token = jwt.sign({ userId, email, isAdmin: false }, config.jwtSecret, { expiresIn: '7d' });
      void emailService.sendWelcomeEmail(name, email);
      res.json({ token, user: { id: userId, email, name, is_admin: false } });
    } catch (error) {
      log.error({ err: error }, 'Registration error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });


router.post('/password/request', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Введите корректный email' });
  }

  try {
    const user = db.prepare('SELECT user_id, name FROM users WHERE email = ?').get(email) as { user_id: string; name: string | null } | undefined;
    if (!user) {
      // Не раскрываем существует ли аккаунт
      return res.json({ status: 'ok' });
    }

    const tokenRecord = issuePasswordResetToken(user.user_id);
    const displayName = user.name ?? email.split('@')[0];
    void emailService.sendPasswordResetEmail(displayName, email, tokenRecord.token);

    res.json({ status: 'ok' });
  } catch (error) {
    log.error({ err: error }, 'Password reset request error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/password/reset', async (req, res) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || typeof token !== 'string' || !password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const tokenRecord = getPasswordResetToken(token);
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Токен не найден или уже использован' });
    }

    if (tokenRecord.used_at) {
      return res.status(400).json({ error: 'Токен уже использован' });
    }

    if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Ссылка устарела, запросите новую' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    updateUserPassword(tokenRecord.user_id, passwordHash);
    markPasswordResetTokenUsed(token);

    res.json({ status: 'password_updated' });
  } catch (error) {
    log.error({ err: error }, 'Password reset apply error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

  router.post('/login', async (req, res) => {
    const { email, password }: LoginRequest = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as {
        user_id: string;
        email: string;
        password_hash: string;
        name: string;
        is_admin?: number;
      } | undefined;
      if (!user) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }

      const payload: AuthTokenPayload = {
        userId: user.user_id,
        email: user.email,
        isAdmin: user.is_admin === 1,
      };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
      res.json({
        token,
        user: {
          user_id: user.user_id,
          email: user.email,
          name: user.name,
          is_admin: user.is_admin === 1,
        },
      });
    } catch (error) {
      log.error({ err: error }, 'Login error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });


router.post('/google', async (req, res) => {
  const { token: idToken } = req.body as { token?: string };
  const googleClient = getGoogleClient();
  const clientId = getGoogleClientId();
  if (!googleClient || !clientId) {
    return res.status(503).json({ error: 'Google OAuth не настроен' });
  }
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'ID token отсутствует' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Не удалось получить данные пользователя Google' });
    }

    if (payload.email_verified === false) {
      return res.status(400).json({ error: 'Email в Google аккаунте не подтвержден' });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name ?? email.split('@')[0];

    let user = db
      .prepare('SELECT user_id, email, name, password_hash, COALESCE(is_admin, 0) as is_admin FROM users WHERE email = ?')
      .get(email) as { user_id: string; email: string; name: string; password_hash: string; is_admin: number } | undefined;

    if (!user) {
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
      db.prepare(
        `INSERT INTO users (user_id, email, password_hash, name, created_at, updated_at, is_admin)
         VALUES (?, ?, ?, ?, ?, ?, 0)`
      ).run(userId, email, passwordHash, name, now, now);
      user = { user_id: userId, email, name, password_hash: passwordHash, is_admin: 0 };
    } else if (!user.name && name) {
      db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE user_id = ?').run(name, new Date().toISOString(), user.user_id);
      user.name = name;
    }

    const payloadJwt: AuthTokenPayload = {
      userId: user.user_id,
      email: user.email,
      isAdmin: user.is_admin === 1,
    };

    const token = jwt.sign(payloadJwt, config.jwtSecret, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        is_admin: user.is_admin === 1,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Google auth error');
    res.status(401).json({ error: 'Не удалось подтвердить Google аккаунт' });
  }
});

  router.get('/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
      const user = db
        .prepare('SELECT user_id, email, name, is_admin FROM users WHERE user_id = ?')
        .get(decoded.userId) as { user_id: string; email: string; name: string; is_admin: number } | undefined;

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json({ user: { user_id: user.user_id, email: user.email, name: user.name, is_admin: user.is_admin === 1 } });
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Google Drive OAuth routes
  router.get('/google/drive', (req, res) => {
    const authReq = req as any;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { googleDriveService } = require('../services/googleDrive');
      const state = crypto.randomBytes(16).toString('hex');
      
      // Сохраняем state на 10 минут
      oauthStates.set(state, {
        userId: authReq.user.user_id,
        expiresAt: Date.now() + 600000,
      });

      const authUrl = googleDriveService.getAuthorizationUrl(state);
      res.json({ authUrl });
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Error getting auth URL');
      res.status(500).json({ error: 'Failed to get authorization URL' });
    }
  });

  router.get('/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      
      if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state parameter' });
      }

      // Верифицируем state
      const stateData = oauthStates.get(state);
      if (!stateData || stateData.expiresAt < Date.now()) {
        oauthStates.delete(state);
        return res.status(400).json({ error: 'Invalid or expired state parameter' });
      }

      const { googleDriveService } = require('../services/googleDrive');
      const userId = stateData.userId;
      
      // Обменяем code на токены
      await googleDriveService.exchangeCodeForTokens(code, userId);
      oauthStates.delete(state);
      
      // Редиректим на /admin с success сообщением
      res.redirect('/admin?google_drive=connected');
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] OAuth callback error');
      res.status(500).json({ error: 'Failed to authorize Google Drive' });
    }
  });

  router.post('/google/disconnect', async (req, res) => {
    try {
      const authReq = req as any;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { googleDriveService } = require('../services/googleDrive');
      const userId = authReq.user.user_id;
      
      await googleDriveService.revokeAccess(userId);
      
      res.json({ success: true });
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Disconnect error');
      res.status(500).json({ error: 'Failed to disconnect Google Drive' });
    }
  });

  router.get('/google/connection-status', async (req, res) => {
    try {
      const authReq = req as any;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { googleDriveService } = require('../services/googleDrive');
      const userId = authReq.user.user_id;
      
      const isConnected = googleDriveService.isConnected(userId);
      const connectionInfo = googleDriveService.getConnectionInfo(userId);
      
      res.json({ isConnected, connectionInfo });
    } catch (error) {
      log.error({ err: error }, '[GoogleDrive] Status check error');
      res.status(500).json({ error: 'Failed to check connection status' });
    }
  });

  /**
   * PUT /api/auth/update-profile
   * Обновить имя пользователя
   */
  router.put('/update-profile', async (req, res) => {
    try {
      const userId = (req as any).userId || null;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { name } = req.body as { name?: string };
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const now = new Date().toISOString();
      db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE user_id = ?').run(
        name.trim(),
        now,
        userId
      );

      const user = db.prepare('SELECT user_id, email, name, is_admin FROM users WHERE user_id = ?').get(userId) as any;
      
      res.json({
        user: {
          user_id: user.user_id,
          email: user.email,
          name: user.name,
          is_admin: user.is_admin === 1,
        },
      });
    } catch (error) {
      log.error({ err: error }, '[auth] Update profile error');
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  /**
   * PUT /api/auth/change-password
   * Изменить пароль пользователя
   */
  router.put('/change-password', async (req, res) => {
    try {
      const userId = (req as any).userId || null;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { currentPassword, newPassword } = req.body as { 
        currentPassword?: string; 
        newPassword?: string; 
      };

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password are required' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      // Проверяем текущий пароль
      const user = db.prepare('SELECT password_hash FROM users WHERE user_id = ?').get(userId) as {
        password_hash: string;
      } | undefined;

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Обновляем пароль
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      const now = new Date().toISOString();
      
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?').run(
        newPasswordHash,
        now,
        userId
      );

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      log.error({ err: error }, '[auth] Change password error');
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Dev endpoint for quick token generation (only in development!)
  if (process.env.NODE_ENV !== 'production') {
    router.get('/dev-token', (_req, res) => {
      const userId = '099e921d-cbf3-44f0-b497-5fd20ce0d8a8';
      const email = 'geramonnn@gmail.com';
      const token = jwt.sign({ userId, email, isAdmin: true }, config.jwtSecret, { expiresIn: '7d' });
      res.json({
        token,
        user: { user_id: userId, email, name: 'Admin User', is_admin: true },
      });
    });
  }

  return router;
}
