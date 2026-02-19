import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../connection', async () => {
  const { createConnectionMock } = await import('./helpers/mockConnectionFactory');
  return createConnectionMock();
});

vi.mock('../nodeWriteRepository', () => ({
  updateNode: vi.fn(),
  updateNodeMetaSystem: vi.fn(),
  createProjectNode: vi.fn(),
  deleteProjectNode: vi.fn(),
  cloneNode: vi.fn(),
}));

import { getNode, listProjectNodes, updateNodeContent } from '../nodeRepository';

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
  db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, content_type, content, meta_json, config_json, visibility_json, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-1', 'text', 'First Node', 'text/plain', 'Hello World', '{"key":"value"}', '{"ai":{"model":"gpt-4"}}', '{}', '#FF0000', 10, 20, 300, 200, 1, '{"incoming":[],"outgoing":[]}', now, now);
  db.prepare(`INSERT INTO nodes (project_id, node_id, type, title, content_type, content, meta_json, config_json, visibility_json, ui_color, bbox_x1, bbox_y1, bbox_x2, bbox_y2, ai_visible, connections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('proj-1', 'node-2', 'image', 'Image Node', 'image/png', null, '{"image_url":"/img.png"}', '{}', '{}', '#00FF00', 0, 0, 240, 120, 0, '{"incoming":[],"outgoing":[]}', now, now);
}

describe('nodeRepository', () => {
  beforeEach(async () => {
    await reset();
    await seedData();
  });

  describe('getNode', () => {
    it('should return a node by projectId and nodeId', () => {
      const node = getNode('proj-1', 'node-1');
      expect(node).toBeTruthy();
      expect(node!.node_id).toBe('node-1');
      expect(node!.type).toBe('text');
      expect(node!.title).toBe('First Node');
      expect(node!.content).toBe('Hello World');
    });

    it('should return parsed meta JSON', () => {
      expect(getNode('proj-1', 'node-1')!.meta).toEqual({ key: 'value' });
    });

    it('should return parsed config JSON', () => {
      expect(getNode('proj-1', 'node-1')!.config).toEqual({ ai: { model: 'gpt-4' } });
    });

    it('should return correct UI properties', () => {
      const node = getNode('proj-1', 'node-1')!;
      expect(node.ui.color).toBe('#FF0000');
      expect(node.ui.bbox).toEqual({ x1: 10, y1: 20, x2: 300, y2: 200 });
    });

    it('should convert ai_visible integer to boolean', () => {
      expect(getNode('proj-1', 'node-1')!.ai_visible).toBe(true);
      expect(getNode('proj-1', 'node-2')!.ai_visible).toBe(false);
    });

    it('should return undefined for non-existent node', () => {
      expect(getNode('proj-1', 'nonexistent')).toBeUndefined();
    });

    it('should return undefined for wrong project', () => {
      expect(getNode('wrong-project', 'node-1')).toBeUndefined();
    });
  });

  describe('listProjectNodes', () => {
    it('should return all nodes for a project', () => {
      expect(listProjectNodes('proj-1')).toHaveLength(2);
    });

    it('should return empty array for non-existent project', () => {
      expect(listProjectNodes('nonexistent')).toEqual([]);
    });

    it('should include all node fields', () => {
      const nodes = listProjectNodes('proj-1');
      const textNode = nodes.find((n) => n.node_id === 'node-1');
      expect(textNode!.type).toBe('text');
      expect(textNode!.content).toBe('Hello World');
      expect(textNode!.meta).toEqual({ key: 'value' });
    });

    it('should handle null content', () => {
      const imageNode = listProjectNodes('proj-1').find((n) => n.node_id === 'node-2');
      expect(imageNode!.content).toBeNull();
    });
  });

  describe('updateNodeContent', () => {
    it('should update node content', () => {
      updateNodeContent('proj-1', 'node-1', { content: 'Updated Content' });
      expect(getNode('proj-1', 'node-1')!.content).toBe('Updated Content');
    });

    it('should update content_type', () => {
      updateNodeContent('proj-1', 'node-1', { content_type: 'text/html' });
      expect(getNode('proj-1', 'node-1')!.content_type).toBe('text/html');
    });

    it('should update meta', () => {
      updateNodeContent('proj-1', 'node-1', { meta: { newKey: 'newValue' } });
      expect(getNode('proj-1', 'node-1')!.meta).toEqual({ newKey: 'newValue' });
    });

    it('should set updated_at to a valid ISO timestamp after update', () => {
      updateNodeContent('proj-1', 'node-1', { content: 'Changed' });
      const node = getNode('proj-1', 'node-1')!;
      // Verify the content was actually updated (proves the function executed)
      expect(node.content).toBe('Changed');
      // Verify updated_at is a valid ISO date string
      expect(node.updated_at).toBeTruthy();
      expect(new Date(node.updated_at).toISOString()).toBe(node.updated_at);
    });

    it('should not change content when only meta is updated', () => {
      updateNodeContent('proj-1', 'node-1', { meta: { extra: true } });
      expect(getNode('proj-1', 'node-1')!.content).toBe('Hello World');
    });
  });
});
