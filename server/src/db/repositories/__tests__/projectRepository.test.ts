import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

vi.mock('../../../utils/projectPaths', () => ({
  getProjectDir: vi.fn((id: string) => `/tmp/test-projects/${id}`),
  resolveProjectPath: vi.fn((id: string, file: string) => `/tmp/test-projects/${id}/${file}`),
}));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  rmSync: vi.fn(),
  cpSync: vi.fn(),
}));

vi.mock('../nodeRepository', () => ({
  listProjectNodes: vi.fn().mockReturnValue([]),
  getNode: vi.fn(),
}));

vi.mock('../edgeRepository', () => ({
  listProjectEdges: vi.fn().mockReturnValue([]),
}));

vi.mock('../collaboratorRepository', () => ({
  getProjectRole: vi.fn().mockReturnValue(null),
  listProjectCollaborators: vi.fn().mockReturnValue([]),
  upsertProjectCollaborator: vi.fn(),
  removeProjectCollaborator: vi.fn(),
  getProjectOwnerId: vi.fn(),
  updateProjectOwner: vi.fn(),
  listAdminProjects: vi.fn().mockReturnValue([]),
}));

import { projectExists, listProjects, getProject, getProjectSettings, deleteProjectRecord, generateCloneProjectId } from '../projectRepository';

async function getDb() {
  const { getTestDb } = await import('./helpers/mockConnectionFactory');
  return getTestDb();
}
async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

async function seedProject(overrides: Record<string, unknown> = {}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const row = {
    project_id: 'proj-1', title: 'Test Project', description: 'A test project',
    settings_json: '{"theme":"dark"}', schemas_json: '{}',
    created_at: now, updated_at: now, user_id: null, is_public: 0,
    ...overrides,
  };
  db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at, user_id, is_public)
     VALUES (@project_id, @title, @description, @settings_json, @schemas_json, @created_at, @updated_at, @user_id, @is_public)`).run(row);
}

describe('projectRepository', () => {
  beforeEach(async () => { await reset(); });

  describe('projectExists', () => {
    it('should return true for existing project', async () => {
      await seedProject();
      expect(projectExists('proj-1')).toBe(true);
    });
    it('should return false for non-existent project', () => {
      expect(projectExists('nonexistent')).toBe(false);
    });
  });

  describe('listProjects', () => {
    it('should return public and ownerless projects when no userId', async () => {
      await seedProject({ project_id: 'public-1', is_public: 1, user_id: null });
      await seedProject({ project_id: 'ownerless-1', is_public: 0, user_id: null });
      await seedProject({ project_id: 'private-1', is_public: 0, user_id: 'user-1' });
      const result = listProjects();
      const ids = result.map((p) => p.project_id);
      expect(ids).toContain('public-1');
      expect(ids).toContain('ownerless-1');
      expect(ids).not.toContain('private-1');
    });

    it('should return empty array when no projects', () => {
      expect(listProjects()).toEqual([]);
    });
  });

  describe('getProject', () => {
    it('should return a project with metadata', async () => {
      await seedProject();
      const result = getProject('proj-1', undefined, { bypassAuth: true });
      expect(result).toBeTruthy();
      expect(result!.project_id).toBe('proj-1');
      expect(result!.title).toBe('Test Project');
      expect(result!.settings).toEqual({ theme: 'dark' });
    });

    it('should return null for non-existent project', () => {
      expect(getProject('nonexistent', undefined, { bypassAuth: true })).toBeNull();
    });

    it('should return null for private project without auth', async () => {
      await seedProject({ user_id: 'user-1', is_public: 0 });
      expect(getProject('proj-1')).toBeNull();
    });

    it('should return project with bypassAuth', async () => {
      await seedProject({ user_id: 'user-1', is_public: 0 });
      expect(getProject('proj-1', undefined, { bypassAuth: true })).toBeTruthy();
    });

    it('should parse settings_json and schemas_json', async () => {
      await seedProject({ settings_json: '{"k":"v"}', schemas_json: '{"s":"t"}' });
      const result = getProject('proj-1', undefined, { bypassAuth: true });
      expect(result!.settings).toEqual({ k: 'v' });
      expect(result!.schemas).toEqual({ s: 't' });
    });
  });

  describe('getProjectSettings', () => {
    it('should return parsed settings', async () => {
      await seedProject({ settings_json: '{"key":"value","nested":{"a":1}}' });
      expect(getProjectSettings('proj-1')).toEqual({ key: 'value', nested: { a: 1 } });
    });

    it('should return empty object for non-existent project', () => {
      expect(getProjectSettings('nonexistent')).toEqual({});
    });
  });

  describe('deleteProjectRecord', () => {
    it('should delete an existing project', async () => {
      await seedProject();
      deleteProjectRecord('proj-1');
      expect(projectExists('proj-1')).toBe(false);
    });

    it('should throw for non-existent project', () => {
      expect(() => deleteProjectRecord('nonexistent')).toThrow();
    });

    it('should enforce userId when provided', async () => {
      await seedProject({ user_id: 'user-1' });
      expect(() => deleteProjectRecord('proj-1', 'wrong-user')).toThrow();
    });

    it('should delete when userId matches', async () => {
      await seedProject({ user_id: 'user-1' });
      deleteProjectRecord('proj-1', 'user-1');
      expect(projectExists('proj-1')).toBe(false);
    });
  });

  describe('generateCloneProjectId', () => {
    it('should generate a clone ID with _copy suffix', () => {
      expect(generateCloneProjectId('my-project')).toBe('my-project_copy');
    });

    it('should add numeric suffix when copy already exists', async () => {
      await seedProject({ project_id: 'my-project_copy' });
      expect(generateCloneProjectId('my-project')).toBe('my-project_copy1');
    });

    it('should increment suffix until unique', async () => {
      await seedProject({ project_id: 'my-project_copy' });
      await seedProject({ project_id: 'my-project_copy1' });
      await seedProject({ project_id: 'my-project_copy2' });
      expect(generateCloneProjectId('my-project')).toBe('my-project_copy3');
    });

    it('should normalize special characters', () => {
      expect(generateCloneProjectId('my project!@#')).toMatch(/^[a-zA-Z0-9_-]+_copy$/);
    });
  });
});
