import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

import {
  getProjectRole,
  listProjectCollaborators,
  upsertProjectCollaborator,
  removeProjectCollaborator,
  getProjectOwnerId,
  updateProjectOwner,
  listAdminProjects,
} from '../collaboratorRepository';

async function getDb() {
  const { getTestDb } = await import('./helpers/mockConnectionFactory');
  return getTestDb();
}
async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

async function seedData(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users (user_id, email, name, password_hash, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('owner-1', 'owner@example.com', 'Owner', '$hash', 0, now, now);
  db.prepare(`INSERT INTO users (user_id, email, name, password_hash, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('editor-1', 'editor@example.com', 'Editor', '$hash', 0, now, now);
  db.prepare(`INSERT INTO users (user_id, email, name, password_hash, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('viewer-1', 'viewer@example.com', 'Viewer', '$hash', 0, now, now);
  db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at, user_id, is_public) VALUES (?, ?, ?, '{}', '{}', ?, ?, ?, ?)`).run('proj-1', 'Project 1', 'desc', now, now, 'owner-1', 0);
  db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at, user_id, is_public) VALUES (?, ?, ?, '{}', '{}', ?, ?, ?, ?)`).run('proj-ownerless', 'Ownerless', 'desc', now, now, null, 0);
}

describe('collaboratorRepository', () => {
  beforeEach(async () => {
    await reset();
    await seedData();
  });

  describe('getProjectRole', () => {
    it('should return owner for the project owner', () => {
      expect(getProjectRole('proj-1', 'owner-1')).toBe('owner');
    });
    it('should return null for a user with no role', () => {
      expect(getProjectRole('proj-1', 'viewer-1')).toBeNull();
    });
    it('should return null for non-existent project', () => {
      expect(getProjectRole('nonexistent', 'owner-1')).toBeNull();
    });
    it('should return collaborator role when set', () => {
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      expect(getProjectRole('proj-1', 'editor-1')).toBe('editor');
    });
    it('should return owner for ownerless private project when user exists', () => {
      expect(getProjectRole('proj-ownerless', 'editor-1')).toBe('owner');
    });
  });

  describe('listProjectCollaborators', () => {
    it('should return empty array when no collaborators exist', () => {
      expect(listProjectCollaborators('proj-1')).toEqual([]);
    });
    it('should return collaborators with user details', () => {
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      upsertProjectCollaborator('proj-1', 'viewer-1', 'viewer');
      const result = listProjectCollaborators('proj-1');
      expect(result).toHaveLength(2);
      const editor = result.find((c) => c.user_id === 'editor-1');
      expect(editor!.role).toBe('editor');
      expect(editor!.email).toBe('editor@example.com');
    });
    it('should order editors before viewers', () => {
      upsertProjectCollaborator('proj-1', 'viewer-1', 'viewer');
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      const result = listProjectCollaborators('proj-1');
      expect(result[0].role).toBe('editor');
      expect(result[1].role).toBe('viewer');
    });
  });

  describe('upsertProjectCollaborator', () => {
    it('should add a new collaborator', async () => {
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      const db = await getDb();
      const row = db.prepare('SELECT * FROM project_collaborators WHERE project_id = ? AND user_id = ?').get('proj-1', 'editor-1') as Record<string, unknown>;
      expect(row).toBeTruthy();
      expect(row.role).toBe('editor');
    });
    it('should update existing collaborator role', async () => {
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      upsertProjectCollaborator('proj-1', 'editor-1', 'viewer');
      const db = await getDb();
      const row = db.prepare('SELECT * FROM project_collaborators WHERE project_id = ? AND user_id = ?').get('proj-1', 'editor-1') as Record<string, unknown>;
      expect(row!.role).toBe('viewer');
    });
    it('should throw when trying to set owner role', () => {
      expect(() => upsertProjectCollaborator('proj-1', 'editor-1', 'owner')).toThrow();
    });
  });

  describe('removeProjectCollaborator', () => {
    it('should remove a collaborator', async () => {
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      removeProjectCollaborator('proj-1', 'editor-1');
      const db = await getDb();
      const row = db.prepare('SELECT * FROM project_collaborators WHERE project_id = ? AND user_id = ?').get('proj-1', 'editor-1');
      expect(row).toBeUndefined();
    });
    it('should not throw when removing non-existent collaborator', () => {
      expect(() => removeProjectCollaborator('proj-1', 'nonexistent')).not.toThrow();
    });
  });

  describe('getProjectOwnerId', () => {
    it('should return the owner user_id', () => {
      expect(getProjectOwnerId('proj-1')).toBe('owner-1');
    });
    it('should return null for ownerless project', () => {
      expect(getProjectOwnerId('proj-ownerless')).toBeNull();
    });
    it('should return null for non-existent project', () => {
      expect(getProjectOwnerId('nonexistent')).toBeNull();
    });
  });

  describe('updateProjectOwner', () => {
    it('should transfer ownership', () => {
      updateProjectOwner('proj-1', 'editor-1');
      expect(getProjectOwnerId('proj-1')).toBe('editor-1');
    });
    it('should make previous owner a viewer', () => {
      updateProjectOwner('proj-1', 'editor-1');
      const collabs = listProjectCollaborators('proj-1');
      const prev = collabs.find((c) => c.user_id === 'owner-1');
      expect(prev).toBeTruthy();
      expect(prev!.role).toBe('viewer');
    });
    it('should remove new owner from collaborators', () => {
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      updateProjectOwner('proj-1', 'editor-1');
      const collabs = listProjectCollaborators('proj-1');
      expect(collabs.find((c) => c.user_id === 'editor-1')).toBeUndefined();
    });
    it('should throw for non-existent project', () => {
      expect(() => updateProjectOwner('nonexistent', 'editor-1')).toThrow();
    });
    it('should throw for non-existent user', () => {
      expect(() => updateProjectOwner('proj-1', 'nonexistent-user')).toThrow();
    });
    it('should be a no-op when setting same owner', () => {
      updateProjectOwner('proj-1', 'owner-1');
      expect(getProjectOwnerId('proj-1')).toBe('owner-1');
    });
  });

  describe('listAdminProjects', () => {
    it('should return all projects with collaborator info', () => {
      upsertProjectCollaborator('proj-1', 'editor-1', 'editor');
      upsertProjectCollaborator('proj-1', 'viewer-1', 'viewer');
      const projects = listAdminProjects();
      const proj1 = projects.find((p) => p.project_id === 'proj-1');
      expect(proj1).toBeTruthy();
      expect(proj1!.editors).toHaveLength(1);
      expect(proj1!.viewers).toHaveLength(1);
      expect(proj1!.collaborator_count).toBe(2);
      expect(proj1!.owner_email).toBe('owner@example.com');
    });
    it('should return projects with zero collaborators', () => {
      const projects = listAdminProjects();
      const ownerless = projects.find((p) => p.project_id === 'proj-ownerless');
      expect(ownerless).toBeTruthy();
      expect(ownerless!.collaborator_count).toBe(0);
    });
  });
});
