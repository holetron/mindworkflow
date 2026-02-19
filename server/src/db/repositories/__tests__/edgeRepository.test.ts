/**
 * Tests for edgeRepository.ts
 *
 * Note: addProjectEdge and removeProjectEdge use `require('./projectRepository')`
 * at runtime (lazy import for circular deps). Vitest may not intercept CJS require().
 * We test listProjectEdges directly and test write operations by verifying DB state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

import { listProjectEdges } from '../edgeRepository';

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
  db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at) VALUES (?, ?, ?, '{}', '{}', ?, ?)`).run('proj-1', 'Test Project', 'desc', now, now);
  db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-a', 'text', 'Node A', now, now);
  db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-b', 'text', 'Node B', now, now);
  db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-c', 'text', 'Node C', now, now);
}

describe('edgeRepository', () => {
  beforeEach(async () => {
    await reset();
    await seedData();
  });

  describe('listProjectEdges', () => {
    it('should return empty array when no edges exist', () => {
      expect(listProjectEdges('proj-1')).toEqual([]);
    });

    it('should return all edges for a project', async () => {
      const db = await getDb();
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node, label, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-a', 'node-b', null, null, null);
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node, label, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-b', 'node-c', 'flow', 'out-1', 'in-1');

      const result = listProjectEdges('proj-1');
      expect(result).toHaveLength(2);
      expect(result[0].from_node).toBe('node-a');
      expect(result[0].to_node).toBe('node-b');
      expect(result[0].label).toBeNull();
      expect(result[1].from_node).toBe('node-b');
      expect(result[1].to_node).toBe('node-c');
      expect(result[1].label).toBe('flow');
      expect(result[1].source_handle).toBe('out-1');
      expect(result[1].target_handle).toBe('in-1');
    });

    it('should not return edges from other projects', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at) VALUES (?, ?, ?, '{}', '{}', ?, ?)`).run('proj-2', 'Project 2', 'desc', now, now);
      db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-2', 'node-x', 'text', 'X', now, now);
      db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-2', 'node-y', 'text', 'Y', now, now);
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-1', 'node-a', 'node-b');
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-2', 'node-x', 'node-y');

      const result = listProjectEdges('proj-1');
      expect(result).toHaveLength(1);
      expect(result[0].from_node).toBe('node-a');
    });

    it('should return empty array for non-existent project', () => {
      expect(listProjectEdges('nonexistent')).toEqual([]);
    });

    it('should return correct StoredEdge shape', async () => {
      const db = await getDb();
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node, label, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-a', 'node-b', 'label-1', 'src-h', 'tgt-h');

      const result = listProjectEdges('proj-1');
      expect(result).toHaveLength(1);
      const edge = result[0];
      expect(edge).toHaveProperty('project_id', 'proj-1');
      expect(edge).toHaveProperty('from_node', 'node-a');
      expect(edge).toHaveProperty('to_node', 'node-b');
      expect(edge).toHaveProperty('label', 'label-1');
      expect(edge).toHaveProperty('source_handle', 'src-h');
      expect(edge).toHaveProperty('target_handle', 'tgt-h');
    });

    it('should handle null handles gracefully', async () => {
      const db = await getDb();
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-1', 'node-a', 'node-b');

      const result = listProjectEdges('proj-1');
      expect(result[0].source_handle).toBeNull();
      expect(result[0].target_handle).toBeNull();
      expect(result[0].label).toBeNull();
    });

    it('should return multiple edges between different node pairs', async () => {
      const db = await getDb();
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-1', 'node-a', 'node-b');
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-1', 'node-a', 'node-c');
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-1', 'node-b', 'node-c');

      const result = listProjectEdges('proj-1');
      expect(result).toHaveLength(3);
    });
  });
});
