import { describe, it, expect } from 'vitest';
import {
  generateNodeId,
  sanitizeSlug,
  createInitialNodeUi,
  createDefaultConnections,
  normalizeFlowNode,
  cloneNodeMeta,
} from './nodeHelpers';
import type { FlowNode, InputPortSpec } from '../api';

function makeNode(id: string): FlowNode {
  return {
    node_id: id,
    type: 'text',
    title: 'Test',
    content: '',
    ui: { color: '#6B7280', bbox: { x1: 0, y1: 0, x2: 450, y2: 200 } },
    ai_visible: true,
    connections: { incoming: [], outgoing: [] },
  };
}

describe('sanitizeSlug', () => {
  it('lowercases and trims input', () => {
    expect(sanitizeSlug('  MyNode  ')).toBe('mynode');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeSlug('my node name')).toBe('my-node-name');
  });

  it('removes special characters', () => {
    expect(sanitizeSlug('hello@world!!')).toBe('helloworld');
  });

  it('returns "node" for empty string', () => {
    expect(sanitizeSlug('')).toBe('node');
  });

  it('returns "node" for string with only special chars', () => {
    expect(sanitizeSlug('!!@@##')).toBe('node');
  });

  it('preserves hyphens and underscores', () => {
    expect(sanitizeSlug('my-node_name')).toBe('my-node_name');
  });

  it('preserves digits', () => {
    expect(sanitizeSlug('node123')).toBe('node123');
  });
});

describe('generateNodeId', () => {
  it('generates n1_ prefix for empty nodes array', () => {
    const id = generateNodeId([], 'test');
    expect(id).toBe('n1_test');
  });

  it('increments from the highest existing node number', () => {
    const existing = [makeNode('n3_text'), makeNode('n1_data')];
    const id = generateNodeId(existing, 'new');
    expect(id).toBe('n4_new');
  });

  it('handles nodes without standard numbering prefix', () => {
    const existing = [makeNode('custom_node')];
    const id = generateNodeId(existing, 'test');
    expect(id).toBe('n1_test');
  });

  it('uses the slug as suffix', () => {
    const id = generateNodeId([], 'my-slug');
    expect(id).toBe('n1_my-slug');
  });
});

describe('createInitialNodeUi', () => {
  it('creates UI at default position when no position given', () => {
    const ui = createInitialNodeUi();
    expect(ui.color).toBe('#6B7280');
    expect(ui.bbox.x1).toBe(0);
    expect(ui.bbox.y1).toBe(0);
  });

  it('creates UI at specified position', () => {
    const ui = createInitialNodeUi({ x: 100, y: 200 });
    expect(ui.bbox.x1).toBe(100);
    expect(ui.bbox.y1).toBe(200);
    expect(ui.bbox.x2).toBeGreaterThan(100);
    expect(ui.bbox.y2).toBeGreaterThan(200);
  });

  it('rounds position values', () => {
    const ui = createInitialNodeUi({ x: 100.7, y: 200.3 });
    expect(ui.bbox.x1).toBe(101);
    expect(ui.bbox.y1).toBe(200);
  });
});

describe('createDefaultConnections', () => {
  it('returns empty incoming and outgoing arrays', () => {
    const connections = createDefaultConnections();
    expect(connections).toEqual({ incoming: [], outgoing: [] });
  });
});

describe('normalizeFlowNode', () => {
  it('normalizes a node with missing ui', () => {
    const node: FlowNode = {
      node_id: 'n1',
      type: 'text',
      title: 'Test',
      ui: undefined as unknown as FlowNode['ui'],
      ai_visible: true,
      connections: { incoming: [], outgoing: [] },
    };
    const result = normalizeFlowNode(node);
    expect(result.ui).toBeDefined();
    expect(result.ui.color).toBe('#6B7280');
    expect(result.ui.bbox).toBeDefined();
  });

  it('defaults ai_visible to true when undefined', () => {
    const node: FlowNode = {
      node_id: 'n1',
      type: 'text',
      title: 'Test',
      ui: { color: '#000', bbox: { x1: 0, y1: 0, x2: 450, y2: 200 } },
      ai_visible: undefined as unknown as boolean,
      connections: { incoming: [], outgoing: [] },
    };
    const result = normalizeFlowNode(node);
    expect(result.ai_visible).toBe(true);
  });

  it('normalizes connections with invalid entries', () => {
    const node: FlowNode = {
      node_id: 'n1',
      type: 'text',
      title: 'Test',
      ui: { color: '#000', bbox: { x1: 0, y1: 0, x2: 450, y2: 200 } },
      ai_visible: true,
      connections: {
        incoming: [
          { edge_id: 'e1', from: 'n2', routing: 'direct' },
          undefined as unknown as { edge_id: string; from: string },
        ],
        outgoing: [
          { edge_id: 'e2', to: 'n3' },
        ],
      },
    };
    const result = normalizeFlowNode(node);
    expect(result.connections.incoming).toHaveLength(1);
    expect(result.connections.incoming[0].edge_id).toBe('e1');
    expect(result.connections.outgoing).toHaveLength(1);
  });

  it('clamps bbox dimensions within valid range', () => {
    const node: FlowNode = {
      node_id: 'n1',
      type: 'text',
      title: 'Test',
      ui: { color: '#000', bbox: { x1: 0, y1: 0, x2: 10, y2: 10 } }, // too small
      ai_visible: true,
      connections: { incoming: [], outgoing: [] },
    };
    const result = normalizeFlowNode(node);
    // Should be clamped to minimum dimensions
    expect(result.ui.bbox.x2 - result.ui.bbox.x1).toBeGreaterThanOrEqual(450);
    expect(result.ui.bbox.y2 - result.ui.bbox.y1).toBeGreaterThanOrEqual(200);
  });
});

describe('cloneNodeMeta', () => {
  it('returns undefined for undefined input', () => {
    expect(cloneNodeMeta(undefined)).toBeUndefined();
  });

  it('clones basic meta without input_ports', () => {
    const meta = { key: 'value', nested: { a: 1 } };
    const result = cloneNodeMeta(meta);
    expect(result).toEqual({ key: 'value', nested: { a: 1 } });
    expect(result).not.toBe(meta);
  });

  it('clones input_ports preserving existing IDs', () => {
    const meta = {
      input_ports: [
        { id: 'existing-id', title: 'Port 1', kind: 'text' as InputPortSpec['kind'] },
      ] as InputPortSpec[],
    };
    const result = cloneNodeMeta(meta);
    expect(result!.input_ports).toHaveLength(1);
    expect(result!.input_ports![0].title).toBe('Port 1');
    // Existing id is kept via port.id ?? generatePortId(...)
    expect(result!.input_ports![0].id).toBe('existing-id');
  });

  it('uses empty id as-is (falsy id is not replaced via ??)', () => {
    const meta = {
      input_ports: [
        { id: '', title: 'Port Empty', kind: 'text' as InputPortSpec['kind'] },
      ] as InputPortSpec[],
    };
    const result = cloneNodeMeta(meta);
    // '' ?? fallback returns '' because '' is not null/undefined
    expect(result!.input_ports![0].id).toBe('');
  });

  it('normalizes max_items to at least 1', () => {
    const meta = {
      input_ports: [
        { id: 'p1', title: 'Port', kind: 'text' as InputPortSpec['kind'], max_items: 0 },
      ] as InputPortSpec[],
    };
    const result = cloneNodeMeta(meta);
    expect(result!.input_ports![0].max_items).toBe(1);
  });

  it('defaults kind to "text" when not a string', () => {
    const meta = {
      input_ports: [
        { id: 'p1', title: 'Port', kind: undefined as unknown as InputPortSpec['kind'] },
      ] as InputPortSpec[],
    };
    const result = cloneNodeMeta(meta);
    expect(result!.input_ports![0].kind).toBe('text');
  });
});
