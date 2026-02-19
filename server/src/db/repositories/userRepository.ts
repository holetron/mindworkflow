// userRepository.ts — User CRUD + auth queries + admin operations
import * as crypto from 'crypto';
import {
  db,
  withTransaction,
  createHttpError,
} from '../connection';
import type {
  ProjectRole,
  AdminUserSummary,
  PasswordResetTokenRecord,
} from '../types';
import { deleteProjectRecord } from './projectRepository';

// ---- User lookups ------------------------------------------------------------

export function findUserByEmail(email: string): { user_id: string; email: string; name: string } | null {
  const row = db
    .prepare('SELECT user_id, email, name FROM users WHERE lower(email) = lower(?)')
    .get(email) as { user_id: string; email: string; name: string } | undefined;
  return row ?? null;
}

// ---- User CRUD ---------------------------------------------------------------

export function updateUserRecord(userId: string, patch: { email?: string; name?: string; is_admin?: boolean }): { user_id: string; email: string; name: string; is_admin: boolean } {
  const current = db
    .prepare('SELECT user_id, email, name, COALESCE(is_admin, 0) AS is_admin FROM users WHERE user_id = ?')
    .get(userId) as { user_id: string; email: string; name: string; is_admin: number } | undefined;
  if (!current) {
    throw createHttpError(404, `User ${userId} not found`);
  }

  const nextEmail = patch.email?.trim() || current.email;
  const nextName = patch.name?.trim() || current.name;
  const nextIsAdmin = patch.is_admin !== undefined ? (patch.is_admin ? 1 : 0) : current.is_admin;

  db.prepare('UPDATE users SET email = ?, name = ?, is_admin = ?, updated_at = ? WHERE user_id = ?')
    .run(nextEmail, nextName, nextIsAdmin, new Date().toISOString(), userId);
  return {
    user_id: userId,
    email: nextEmail,
    name: nextName,
    is_admin: nextIsAdmin === 1,
  };
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?')
    .run(passwordHash, now, userId);
  if (result.changes === 0) {
    throw createHttpError(404, `User ${userId} not found`);
  }
}

export function deleteUserCascade(userId: string): void {
  const ownerProjects = db
    .prepare("SELECT project_id FROM projects WHERE user_id = ?")
    .all(userId) as Array<{ project_id: string }>;

  for (const project of ownerProjects) {
    deleteProjectRecord(project.project_id, userId);
  }

  db.prepare("DELETE FROM project_collaborators WHERE user_id = ?").run(userId);
  const result = db.prepare("DELETE FROM users WHERE user_id = ?").run(userId);
  if (result.changes === 0) {
    throw createHttpError(404, "User " + userId + " not found");
  }
}

// ---- Password reset tokens ---------------------------------------------------

export function issuePasswordResetToken(userId: string, ttlMinutes = 60): PasswordResetTokenRecord {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  withTransaction(() => {
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
    db.prepare(
      `INSERT INTO password_reset_tokens (token, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(token, userId, expiresAt.toISOString(), now.toISOString());
  });

  return {
    token,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
    used_at: null,
  };
}

export function getPasswordResetToken(token: string): PasswordResetTokenRecord | undefined {
  return db
    .prepare(
      `SELECT token, user_id, expires_at, created_at, used_at
       FROM password_reset_tokens
       WHERE token = ?`,
    )
    .get(token) as PasswordResetTokenRecord | undefined;
}

export function markPasswordResetTokenUsed(token: string): void {
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE token = ?').run(
    new Date().toISOString(),
    token,
  );
  // Best effort cleanup of expired or used tokens
  db.prepare('DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR datetime(expires_at) <= datetime(?)').run(
    new Date().toISOString(),
  );
}

// ---- Admin user queries ------------------------------------------------------

export function listAdminUsers(): AdminUserSummary[] {
  const users = db
    .prepare('SELECT user_id, email, name, created_at, updated_at, COALESCE(is_admin, 0) AS is_admin FROM users ORDER BY datetime(created_at) DESC')
    .all() as Array<{ user_id: string; email: string; name: string; created_at: string; updated_at: string; is_admin: number }>;

  return users.map((user) => {
    const projects = db
      .prepare(
        `SELECT project_id, title, created_at, updated_at
         FROM projects
         WHERE user_id = ?
         ORDER BY datetime(updated_at) DESC`
      )
      .all(user.user_id) as Array<{ project_id: string; title: string; created_at: string; updated_at: string }>;

    return {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      created_at: user.created_at,
      is_admin: user.is_admin === 1,
      projects,
    };
  });
}
