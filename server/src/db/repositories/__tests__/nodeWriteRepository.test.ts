/**
 * Tests for nodeWriteRepository.ts
 *
 * Note: createProjectNode, deleteProjectNode, and updateNode use
 * `require('./projectRepository')` at runtime (lazy import for circular deps).
 * Vitest may not intercept CJS require() calls. We test what we can directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

// cloneNode and helper functions don't need projectRepository
import { getNode } from '../nodeRepository';

async function getDb() {
  const { getTestDb } = await import('./helpers/mockConnectionFactory');
  return getTestDb();
}
async function reset() {
  const { resetTestDb } = await import('./helpers/mockConnectionFactory');
  resetTestDb();
}

async function seedProjectWithNode(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO projects (project_id, title, description, settings_json, schemas_json, created_at, updated_at) VALUES (?, ?, ?, '{}', '{}', ?, ?)`).run('proj-1', 'Test Project', 'desc', now, now);
  db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, content, meta_json, config_json, visibility_json, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('proj-1', 'existing-node', 'text', 'Existing', 'Hello', '{}', '{}', '{}', '#6B7280', 0, 0, 240, 120, 1, '{"incoming":[],"outgoing":[]}', now, now);
}

describe('nodeWriteRepository', () => {
  beforeEach(async () => {
    await reset();
    await seedProjectWithNode();
  });

  describe('cloneNode', () => {
    // Import cloneNode dynamically to allow mock setup
    async function importCloneNode() {
      const mod = await import('../nodeWriteRepository');
      return mod.cloneNode;
    }

    it('should clone a node with a new ID', async () => {
      const cloneNode = (await importCloneNode());
      const result = cloneNode('proj-1', 'existing-node', false);
      expect(result.node_id).not.toBe('existing-node');
      expect(result.node_id).toContain('clone');
      expect(result.title).toContain('(clone)');
    });

    it('should preserve content from source', async () => {
      const cloneNode = (await importCloneNode());
      const result = cloneNode('proj-1', 'existing-node', false);
      expect(result.content).toBe('Hello');
    });

    it('should throw for non-existent source node', async () => {
      const cloneNode = (await importCloneNode());
      expect(() => cloneNode('proj-1', 'nonexistent', false)).toThrow();
    });

    it('should clone outgoing edges', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('proj-1', 'child-node', 'text', 'Child', now, now);
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-1', 'existing-node', 'child-node');

      const cloneNode = (await importCloneNode());
      const result = cloneNode('proj-1', 'existing-node', false);
      const edges = db.prepare('SELECT * FROM edges WHERE project_id = ? AND from_node = ?').all('proj-1', result.node_id) as Array<Record<string, unknown>>;
      expect(edges).toHaveLength(1);
      expect(edges[0].to_node).toBe('child-node');
    });

    it('should clone with includeSubnodes', async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, content, meta_json, config_json, visibility_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', '{}', '{}', ?, ?)`).run('proj-1', 'child-node', 'text', 'Child', 'Child content', now, now);
      db.prepare(`INSERT INTO edges (project_id, from_node, to_node) VALUES (?, ?, ?)`).run('proj-1', 'existing-node', 'child-node');

      const cloneNode = (await importCloneNode());
      const result = cloneNode('proj-1', 'existing-node', true);

      // The cloned node should exist
      expect(result.node_id).toContain('clone');
      // A cloned child should also exist
      const allNodes = db.prepare('SELECT node_id FROM nodes WHERE project_id = ?').all('proj-1') as Array<{ node_id: string }>;
      // Should have original (existing-node, child-node) + clones
      expect(allNodes.length).toBeGreaterThanOrEqual(4);
    });

    it('should generate incremental clone IDs', async () => {
      const cloneNode = (await importCloneNode());
      const clone1 = cloneNode('proj-1', 'existing-node', false);
      const clone2 = cloneNode('proj-1', 'existing-node', false);
      expect(clone1.node_id).not.toBe(clone2.node_id);
      expect(clone1.node_id).toMatch(/existing-node_clone_\d+/);
      expect(clone2.node_id).toMatch(/existing-node_clone_\d+/);
    });
  });

  describe('node read operations after write', () => {
    it('should correctly read a cloned node via getNode', async () => {
      const cloneNode = (await import('../nodeWriteRepository')).cloneNode;
      const cloned = cloneNode('proj-1', 'existing-node', false);

      const node = getNode('proj-1', cloned.node_id);
      expect(node).toBeTruthy();
      expect(node!.type).toBe('text');
      expect(node!.content).toBe('Hello');
      expect(node!.title).toContain('(clone)');
    });
  });
});
