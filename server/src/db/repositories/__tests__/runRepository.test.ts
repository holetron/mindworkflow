import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted — use dynamic require inside them
vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

import { storeRun, getNodeRuns } from '../runRepository';

// Helper to get the test DB — must import dynamically after mock setup
async function getDb() {
  const { getTestDb } = await import('./helpers/mockConnectionFactory');
  return getTestDb();
}

async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

async function seedProjectAndNode(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at)
     VALUES (?, ?, ?, '{}', '{}', ?, ?)`,
  ).run('proj-1', 'Test Project', 'desc', now, now);
  db.prepare(
    `INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('proj-1', 'node-1', 'text', 'Test Node', now, now);
}

describe('runRepository', () => {
  beforeEach(async () => {
    await reset();
    await seedProjectAndNode();
  });

  describe('storeRun', () => {
    it('should store a run record', async () => {
      const run = {
        run_id: 'run-1',
        project_id: 'proj-1',
        node_id: 'node-1',
        started_at: '2024-01-01T00:00:00.000Z',
        finished_at: '2024-01-01T00:01:00.000Z',
        status: 'completed',
        input_hash: 'abc123',
        output_hash: 'def456',
        logs_json: '{"messages":["done"]}',
      };

      storeRun(run);

      const db = await getDb();
      const row = db.prepare('SELECT * FROM runs WHERE run_id = ?').get('run-1') as Record<string, unknown>;
      expect(row).toBeTruthy();
      expect(row.project_id).toBe('proj-1');
      expect(row.node_id).toBe('node-1');
      expect(row.status).toBe('completed');
    });
  });

  describe('getNodeRuns', () => {
    it('should return empty array when no runs exist', () => {
      const result = getNodeRuns('proj-1', 'node-1');
      expect(result).toEqual([]);
    });

    it('should return runs for a specific node ordered by started_at DESC', () => {
      storeRun({
        run_id: 'run-1', project_id: 'proj-1', node_id: 'node-1',
        started_at: '2024-01-01T00:00:00.000Z', finished_at: '2024-01-01T00:01:00.000Z',
        status: 'completed', input_hash: 'a', output_hash: 'b', logs_json: '{}',
      });
      storeRun({
        run_id: 'run-2', project_id: 'proj-1', node_id: 'node-1',
        started_at: '2024-01-02T00:00:00.000Z', finished_at: '2024-01-02T00:01:00.000Z',
        status: 'failed', input_hash: 'c', output_hash: 'd', logs_json: '{"error":"something"}',
      });

      const result = getNodeRuns('proj-1', 'node-1');
      expect(result).toHaveLength(2);
      expect(result[0].run_id).toBe('run-2');
      expect(result[1].run_id).toBe('run-1');
    });

    it('should not return runs from other nodes', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('proj-1', 'node-2', 'text', 'Other Node', now, now);

      storeRun({
        run_id: 'run-1', project_id: 'proj-1', node_id: 'node-1',
        started_at: '2024-01-01T00:00:00.000Z', finished_at: '2024-01-01T00:01:00.000Z',
        status: 'completed', input_hash: 'a', output_hash: 'b', logs_json: '{}',
      });
      storeRun({
        run_id: 'run-2', project_id: 'proj-1', node_id: 'node-2',
        started_at: '2024-01-02T00:00:00.000Z', finished_at: '2024-01-02T00:01:00.000Z',
        status: 'completed', input_hash: 'c', output_hash: 'd', logs_json: '{}',
      });

      const result = getNodeRuns('proj-1', 'node-1');
      expect(result).toHaveLength(1);
      expect(result[0].run_id).toBe('run-1');
    });
  });
});
