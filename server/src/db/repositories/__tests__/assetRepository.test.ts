import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

import { createAssetRecord } from '../assetRepository';

async function getDb() {
  const { getTestDb } = await import('./helpers/mockConnectionFactory');
  return getTestDb();
}
async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

async function seedProject(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at)
     VALUES (?, ?, ?, '{}', '{}', ?, ?)`,
  ).run('proj-1', 'Test Project', 'desc', now, now);
}

describe('assetRepository', () => {
  beforeEach(async () => {
    await reset();
    await seedProject();
  });

  describe('createAssetRecord', () => {
    it('should create an asset record with generated UUID', () => {
      const result = createAssetRecord({ projectId: 'proj-1', path: '/images/photo.png' });
      expect(result.asset_id).toBeTruthy();
      expect(result.project_id).toBe('proj-1');
      expect(result.node_id).toBeNull();
      expect(result.path).toBe('/images/photo.png');
      expect(result.meta).toEqual({});
      expect(result.created_at).toBeTruthy();
    });

    it('should create an asset record with nodeId', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('proj-1', 'node-1', 'image', 'Image Node', now, now);

      const result = createAssetRecord({ projectId: 'proj-1', nodeId: 'node-1', path: '/images/photo.png' });
      expect(result.node_id).toBe('node-1');
    });

    it('should store meta data', () => {
      const result = createAssetRecord({
        projectId: 'proj-1', path: '/images/photo.png',
        meta: { width: 1920, height: 1080, format: 'png' },
      });
      expect(result.meta).toEqual({ width: 1920, height: 1080, format: 'png' });
    });

    it('should persist to the database', async () => {
      const result = createAssetRecord({ projectId: 'proj-1', path: '/images/photo.png' });
      const db = await getDb();
      const row = db.prepare('SELECT * FROM assets WHERE asset_id = ?').get(result.asset_id) as Record<string, unknown>;
      expect(row).toBeTruthy();
      expect(row.path).toBe('/images/photo.png');
    });

    it('should create multiple asset records with unique IDs', () => {
      const first = createAssetRecord({ projectId: 'proj-1', path: '/a.png' });
      const second = createAssetRecord({ projectId: 'proj-1', path: '/b.png' });
      expect(first.asset_id).not.toBe(second.asset_id);
    });
  });
});
