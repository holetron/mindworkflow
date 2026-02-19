import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

vi.mock('../projectRepository', () => ({
  deleteProjectRecord: vi.fn(async (projectId: string) => {
    // Use dynamic import to get db inside the mock
    const { getTestDb } = await import('./helpers/mockConnectionFactory');
    const db = getTestDb();
    db.prepare('DELETE FROM projects WHERE project_id = ?').run(projectId);
  }),
}));

import {
  findUserByEmail, updateUserRecord, updateUserPassword,
  deleteUserCascade, issuePasswordResetToken, getPasswordResetToken,
  markPasswordResetTokenUsed, listAdminUsers,
} from '../userRepository';

async function getDb() {
  const { getTestDb } = await import('./helpers/mockConnectionFactory');
  return getTestDb();
}
async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

async function seedUsers(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users (user_id, email, name, password_hash, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('user-1', 'alice@example.com', 'Alice', '$2b$hash1', 0, now, now);
  db.prepare(`INSERT INTO users (user_id, email, name, password_hash, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('user-2', 'bob@example.com', 'Bob', '$2b$hash2', 1, now, now);
}

describe('userRepository', () => {
  beforeEach(async () => {
    await reset();
    await seedUsers();
  });

  describe('findUserByEmail', () => {
    it('should find a user by email (case insensitive)', () => {
      const result = findUserByEmail('ALICE@EXAMPLE.COM');
      expect(result).toBeTruthy();
      expect(result!.user_id).toBe('user-1');
      expect(result!.email).toBe('alice@example.com');
    });

    it('should return null for non-existent email', () => {
      expect(findUserByEmail('nobody@example.com')).toBeNull();
    });
  });

  describe('updateUserRecord', () => {
    it('should update email', () => {
      expect(updateUserRecord('user-1', { email: 'newalice@example.com' }).email).toBe('newalice@example.com');
    });

    it('should update name', () => {
      expect(updateUserRecord('user-1', { name: 'Alice Smith' }).name).toBe('Alice Smith');
    });

    it('should update is_admin', () => {
      expect(updateUserRecord('user-1', { is_admin: true }).is_admin).toBe(true);
    });

    it('should keep current values when fields not provided', () => {
      const result = updateUserRecord('user-1', { name: 'New Name' });
      expect(result.email).toBe('alice@example.com');
      expect(result.is_admin).toBe(false);
    });

    it('should throw for non-existent user', () => {
      expect(() => updateUserRecord('nonexistent', { name: 'Nobody' })).toThrow();
    });
  });

  describe('updateUserPassword', () => {
    it('should update the password hash', async () => {
      updateUserPassword('user-1', '$2b$newhash');
      const db = await getDb();
      const row = db.prepare('SELECT password_hash FROM users WHERE user_id = ?').get('user-1') as { password_hash: string };
      expect(row.password_hash).toBe('$2b$newhash');
    });

    it('should throw for non-existent user', () => {
      expect(() => updateUserPassword('nonexistent', '$2b$hash')).toThrow();
    });
  });

  describe('deleteUserCascade', () => {
    it('should delete user and collaborator entries', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at, user_id) VALUES (?, ?, ?, '{}', '{}', ?, ?, ?)`).run('proj-bob', 'Bob Proj', 'desc', now, now, 'user-2');
      db.prepare(`INSERT INTO project_collaborators (project_id, user_id, role, created_at, updated_at, added_at) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-bob', 'user-1', 'editor', now, now, now);

      deleteUserCascade('user-1');

      expect(db.prepare('SELECT * FROM users WHERE user_id = ?').get('user-1')).toBeUndefined();
      expect(db.prepare('SELECT * FROM project_collaborators WHERE user_id = ?').get('user-1')).toBeUndefined();
    });

    it('should throw for non-existent user', () => {
      expect(() => deleteUserCascade('nonexistent')).toThrow();
    });
  });

  describe('issuePasswordResetToken', () => {
    it('should generate a token', () => {
      const result = issuePasswordResetToken('user-1');
      expect(result.token).toBeTruthy();
      expect(result.user_id).toBe('user-1');
      expect(result.used_at).toBeNull();
    });

    it('should delete previous tokens for same user', async () => {
      issuePasswordResetToken('user-1');
      const second = issuePasswordResetToken('user-1');
      const db = await getDb();
      const tokens = db.prepare('SELECT * FROM password_reset_tokens WHERE user_id = ?').all('user-1') as Array<Record<string, unknown>>;
      expect(tokens).toHaveLength(1);
      expect(tokens[0].token).toBe(second.token);
    });

    it('should set expiry based on ttlMinutes', () => {
      const result = issuePasswordResetToken('user-1', 30);
      const diff = (new Date(result.expires_at).getTime() - new Date(result.created_at).getTime()) / (1000 * 60);
      expect(Math.round(diff)).toBe(30);
    });
  });

  describe('getPasswordResetToken', () => {
    it('should return a token record', () => {
      const issued = issuePasswordResetToken('user-1');
      const result = getPasswordResetToken(issued.token);
      expect(result).toBeTruthy();
      expect(result!.user_id).toBe('user-1');
    });

    it('should return undefined for non-existent token', () => {
      expect(getPasswordResetToken('fake-token')).toBeUndefined();
    });
  });

  describe('markPasswordResetTokenUsed', () => {
    it('should mark and clean up the token', () => {
      const issued = issuePasswordResetToken('user-1');
      markPasswordResetTokenUsed(issued.token);
      expect(getPasswordResetToken(issued.token)).toBeUndefined();
    });
  });

  describe('listAdminUsers', () => {
    it('should return all users with project info', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at, user_id) VALUES (?, ?, ?, '{}', '{}', ?, ?, ?)`).run('proj-alice', 'Alice Proj', 'desc', now, now, 'user-1');

      const result = listAdminUsers();
      expect(result).toHaveLength(2);
      const alice = result.find((u) => u.user_id === 'user-1');
      expect(alice!.projects).toHaveLength(1);
      const bob = result.find((u) => u.user_id === 'user-2');
      expect(bob!.is_admin).toBe(true);
      expect(bob!.projects).toHaveLength(0);
    });
  });
});
